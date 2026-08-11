const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { loadExtension, invalidateScriptCache, scriptCache } = require('./emulator');
const { ExtensionWatcher } = require('./utils/file_watcher');
const { LogStreamer } = require('./utils/log_streamer');
const { globalResponseCache } = require('./utils/response_cache');
const { generateSkeleton, listTemplates } = require('./utils/skeleton_generator');
const { validateExtension, validateDirectory } = require('./utils/extension_validator');
const { deployExtension, TARGET_CONFIGS } = require('./utils/deploy_helper');
const { watchHistory, favorites, preferencesDb, repositoryDb, PersistentSharedPreferences, closeDb } = require('./utils/database');
const { addOrSyncRepo, removeRepo, syncAllRepos } = require('./utils/repo_manager');

const app = express();
const PORT = process.env.PORT || 7860; // Hugging Face Spaces default port is 7860
const EXEC_TIMEOUT_MS = 30000; // 30 seconds default execution timeout

app.use(cors());
app.use(express.json());

// Video & HLS Stream Proxy Endpoint
app.get('/api/proxy/video', async (req, res) => {
    const targetUrl = req.query.url;
    const referer = req.query.referer || 'https://anizone.to/';

    if (!targetUrl) {
        return res.status(400).send("Missing 'url' parameter");
    }

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': referer
        };

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const axios = require('axios');
        const response = await axios.get(targetUrl, {
            headers,
            responseType: 'stream',
            validateStatus: () => true
        });

        res.status(response.status);

        const passthroughHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
        passthroughHeaders.forEach(h => {
            if (response.headers[h]) {
                res.setHeader(h, response.headers[h]);
            }
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');

        const contentType = (response.headers['content-type'] || '').toLowerCase();
        const isM3U8 = targetUrl.toLowerCase().includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8') || contentType.includes('apple') || contentType.includes('hls');

        if (isM3U8) {
            const chunks = [];
            for await (const chunk of response.data) {
                chunks.push(chunk);
            }
            let body = Buffer.concat(chunks).toString('utf-8');
            const baseUrlObj = new URL(targetUrl);
            const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
            const host = req.get('host');
            const protocol = req.protocol;
            const proxyPrefix = `${protocol}://${host}/api/proxy/video?url=`;

            // 1. Rewrite standalone segment lines
            const lines = body.split('\n');
            const rewrittenLines = lines.map(line => {
                let trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return line;
                let absUrl = trimmed.startsWith('http') ? trimmed : (trimmed.startsWith('/') ? `${baseUrlObj.origin}${trimmed}` : `${basePath}${trimmed}`);
                return `${proxyPrefix}${encodeURIComponent(absUrl)}&referer=${encodeURIComponent(referer)}`;
            });
            body = rewrittenLines.join('\n');

            // 2. Rewrite URI="..." attributes in tag lines (e.g. #EXT-X-MEDIA, #EXT-X-KEY)
            body = body.replace(/URI="((?!http:\/\/[^/]+\/api\/proxy\/video)[^"]+)"/g, (match, p1) => {
                let absUrl = p1.startsWith('http') ? p1 : (p1.startsWith('/') ? `${baseUrlObj.origin}${p1}` : `${basePath}${p1}`);
                return `URI="${proxyPrefix}${encodeURIComponent(absUrl)}&referer=${encodeURIComponent(referer)}"`;
            });

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Content-Length', Buffer.byteLength(body));
            return res.send(body);
        } else {
            response.data.pipe(res);
        }
    } catch (e) {
        console.error('[VideoProxy] Error:', e.message);
        res.status(500).send(`Proxy error: ${e.message}`);
    }
});
app.use(express.static(path.join(__dirname, 'public')));

const LOCAL_EXT_DIR = path.join(__dirname, 'extensions');
const DATA_EXT_DIR = path.join(__dirname, 'data', 'extensions');

const directories = {
    'bundled': LOCAL_EXT_DIR,
    'development': path.join(__dirname, '../mangayomi-extensionsTEST/javascript/anime/src/en/working/'),
    'prod-safe': path.join(__dirname, '../prod_extension-main/working/'),
    'prod-nsfw': path.join(__dirname, '../yomiextensionreal-main/nsfw/'),
    'prod-real': path.join(__dirname, '../yomiextensionreal-main/real/'),
    'repository': DATA_EXT_DIR
};

console.log('Registered extension groups:', Object.keys(directories));

// Cache mapping: source_name/source_id -> extension info
const sourceCache = new Map();

function getJsFilesRecursive(dirPath) {
    let results = [];
    if (!fs.existsSync(dirPath)) return results;
    const list = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const dirent of list) {
        const fullPath = path.join(dirPath, dirent.name);
        if (dirent.isDirectory()) {
            results = results.concat(getJsFilesRecursive(fullPath));
        } else if (dirent.name.endsWith('.js')) {
            results.push({ fullPath, fileName: dirent.name });
        }
    }
    return results;
}

function initCache() {
    sourceCache.clear();
    for (const [group, dirPath] of Object.entries(directories)) {
        if (!fs.existsSync(dirPath)) {
            // Optional local development paths are skipped silently on production deployments
            continue;
        }
        const files = getJsFilesRecursive(dirPath);
        for (const { fullPath, fileName } of files) {
            try {
                const { metadata } = loadExtension(fullPath);
                const meta = metadata[0];
                if (meta) {
                    const fallbackId = meta.id !== undefined && meta.id !== null ? meta.id : (meta.name ? meta.name.toLowerCase().replace(/[^a-z0-9_]/g, '_') : fileName.replace('.js', ''));
                    const info = {
                        filePath: fullPath,
                        group: group,
                        fileName: fileName,
                        name: meta.name || fileName.replace('.js', ''),
                        id: fallbackId,
                        lang: meta.lang || 'en',
                        version: meta.version || '1.0.0',
                        baseUrl: meta.baseUrl || '',
                        iconUrl: meta.iconUrl || '',
                        isNsfw: meta.isNsfw || false
                    };
                    // Cache with group prefix
                    sourceCache.set(`${group}/${info.name.toLowerCase()}`, info);
                    sourceCache.set(`${group}/${String(info.id).toLowerCase()}`, info);

                    // Backward compatibility fallback keys
                    if (group === 'development' || group === 'repository' || !sourceCache.has(info.name.toLowerCase())) {
                        sourceCache.set(info.name.toLowerCase(), info);
                        sourceCache.set(String(info.id).toLowerCase(), info);
                    }
                    console.log(`Cached extension: [${group}] ${info.name} (ID: ${info.id})`);
                }
            } catch (e) {
                console.error(`Failed to parse/cache ${fileName} in group '${group}':`, e.message);
            }
        }
    }
}

// Initialize cache on startup
initCache();

// --- Hot-Reload Watcher ---
const watcher = new ExtensionWatcher(directories, (event, filePath, group) => {
    const fileName = path.basename(filePath);
    console.log(`[HotReload] Reloading extensions due to ${event} in [${group}]...`);
    // Invalidate the specific script from compiled cache
    invalidateScriptCache(filePath);
    // Re-scan all extensions
    initCache();
    console.log(`[HotReload] Reload complete. ${sourceCache.size / 2} sources loaded.`);
    // Broadcast reload event to WebSocket clients
    if (global._logStreamer) {
        global._logStreamer.sendReloadEvent(event, fileName, group);
    }
});
watcher.start();

function getExtensionInstance(sourceNameOrId, preferences = {}, group = null, logCallback = null) {
    let info = null;
    if (group) {
        info = sourceCache.get(`${group}/${sourceNameOrId.toLowerCase()}`);
    } else {
        info = sourceCache.get(sourceNameOrId.toLowerCase());
    }
    if (!info) return null;
    return loadExtension(info.filePath, preferences, logCallback);
}

/**
 * Wraps an async action with an execution timeout guard.
 */
function withTimeout(promise, timeoutMs = EXEC_TIMEOUT_MS, actionName = 'Action') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${actionName} execution timed out after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);
}

// --- REST Endpoints ---

// Healthcheck/Welcome & Root UI Route
app.get('/', (req, res) => {
    if (req.accepts('html')) {
        return res.sendFile(path.join(__dirname, 'public', 'tester.html'));
    }
    res.json({
        status: 'online',
        message: 'Mangayomi Extension Runner API is running',
        available_sources: Array.from(new Set(Array.from(sourceCache.values()).map(s => s.name)))
    });
});

// Explicit Healthcheck for Render / Docker / Load Balancers
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'vadlightrunner-backend',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// List available sources (default: development/testing folder)
app.get('/api/sources', (req, res) => {
    const targetGroup = req.query.group || 'development';
    let list = Array.from(sourceCache.values());
    if (targetGroup !== 'all') {
        list = list.filter(s => s.group === targetGroup);
    }
    const sources = Array.from(new Set(list.map(s => JSON.stringify({
        name: s.name,
        id: s.id,
        lang: s.lang,
        version: s.version,
        baseUrl: s.baseUrl,
        iconUrl: s.iconUrl,
        isNsfw: s.isNsfw,
        group: s.group
    })))).map(s => JSON.parse(s));
    res.json(sources);
});

// Refresh cache endpoint
app.post('/api/refresh', (req, res) => {
    try {
        initCache();
        res.json({ success: true, message: `Scanned and loaded ${sourceCache.size / 2} sources` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Extension Repository Management Endpoints ---

// Get all added repositories
app.get('/api/repos', (req, res) => {
    try {
        const repos = repositoryDb.getAllRepos();
        res.json(repos);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add a new extension repository URL
app.post('/api/repos/add', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing required 'url' parameter" });

    try {
        if (global._logStreamer) global._logStreamer.sendLog('API', 'info', `Adding repository: ${url}`);
        const result = await addOrSyncRepo(url);
        initCache(); // Refresh source cache with newly installed extensions
        if (global._logStreamer) global._logStreamer.sendLog('API', 'info', `Repository added successfully (${result.installedCount} extensions)`);
        res.json(result);
    } catch (e) {
        console.error('Error adding repository:', e);
        if (global._logStreamer) global._logStreamer.sendLog('API', 'error', `Failed to add repository: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Remove a repository
app.delete('/api/repos', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing required 'url' parameter" });

    try {
        const result = removeRepo(url);
        initCache(); // Refresh source cache
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Sync all repositories
app.post('/api/repos/sync', async (req, res) => {
    try {
        const results = await syncAllRepos();
        initCache(); // Refresh source cache
        res.json({ success: true, results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1. Get Popular listing
app.get('/api/:source/popular', async (req, res) => {
    const { source } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    const startTime = Date.now();
    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) {
            if (global._logStreamer) global._logStreamer.sendLog('API', 'error', `Source '${source}' not found for /popular`);
            return res.status(404).json({ error: `Source '${source}' not found` });
        }
        
        const extName = ext.metadata[0]?.name || source;
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/popular (page ${page}) on '${extName}'`);
        }

        const result = await withTimeout(ext.instance.getPopular(page), EXEC_TIMEOUT_MS, 'getPopular');
        const elapsed = Date.now() - startTime;
        const count = Array.isArray(result) ? result.length : (result?.list?.length || 0);

        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/popular on '${extName}' completed in ${elapsed}ms (${count} items)`);
        }

        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/popular:`, e);
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'error', `GET /api/${source}/popular failed: ${e.message}`);
        }
        res.status(500).json({ error: e.message });
    }
});

// 2. Get Latest updates listing
app.get('/api/:source/latest', async (req, res) => {
    const { source } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    const startTime = Date.now();
    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) {
            if (global._logStreamer) global._logStreamer.sendLog('API', 'error', `Source '${source}' not found for /latest`);
            return res.status(404).json({ error: `Source '${source}' not found` });
        }
        
        const extName = ext.metadata[0]?.name || source;
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/latest (page ${page}) on '${extName}'`);
        }

        const result = await withTimeout(ext.instance.getLatestUpdates(page), EXEC_TIMEOUT_MS, 'getLatestUpdates');
        const elapsed = Date.now() - startTime;
        const count = Array.isArray(result) ? result.length : (result?.list?.length || 0);

        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/latest on '${extName}' completed in ${elapsed}ms (${count} items)`);
        }

        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/latest:`, e);
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'error', `GET /api/${source}/latest failed: ${e.message}`);
        }
        res.status(500).json({ error: e.message });
    }
});

// 3. Search
app.get('/api/:source/search', async (req, res) => {
    const { source } = req.params;
    const { query } = req.query;
    const page = parseInt(req.query.page || '1', 10);
    const startTime = Date.now();
    
    // Parse filters query parameter if present
    let filters = [];
    if (req.query.filters) {
        try {
            filters = JSON.parse(req.query.filters);
        } catch (e) {
            console.warn(`Failed to parse filters JSON: ${req.query.filters}`);
        }
    }

    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) {
            if (global._logStreamer) global._logStreamer.sendLog('API', 'error', `Source '${source}' not found for /search`);
            return res.status(404).json({ error: `Source '${source}' not found` });
        }
        
        const extName = ext.metadata[0]?.name || source;
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/search query='${query || ''}' (page ${page}) on '${extName}'`);
        }

        const result = await withTimeout(ext.instance.search(query || '', page, filters), EXEC_TIMEOUT_MS, 'search');
        const elapsed = Date.now() - startTime;
        const count = Array.isArray(result) ? result.length : (result?.list?.length || 0);

        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/search on '${extName}' completed in ${elapsed}ms (${count} items)`);
        }

        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/search:`, e);
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'error', `GET /api/${source}/search failed: ${e.message}`);
        }
        res.status(500).json({ error: e.message });
    }
});

// 4. Detail (Get Anime Info & Episodes)
app.get('/api/:source/detail', async (req, res) => {
    const { source } = req.params;
    const { url } = req.query;
    const startTime = Date.now();
    if (!url) return res.status(400).json({ error: "Missing required 'url' parameter" });

    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) {
            if (global._logStreamer) global._logStreamer.sendLog('API', 'error', `Source '${source}' not found for /detail`);
            return res.status(404).json({ error: `Source '${source}' not found` });
        }
        
        const extName = ext.metadata[0]?.name || source;
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/detail url='${url}' on '${extName}'`);
        }

        const result = await withTimeout(ext.instance.getDetail(url), EXEC_TIMEOUT_MS, 'getDetail');
        const elapsed = Date.now() - startTime;
        const epCount = result?.episodes?.length || result?.chapters?.length || 0;

        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/detail on '${extName}' completed in ${elapsed}ms (${epCount} episodes)`);
        }

        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/detail:`, e);
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'error', `GET /api/${source}/detail failed: ${e.message}`);
        }
        res.status(500).json({ error: e.message });
    }
});

// 5. Video List (Get Video Streams)
app.get('/api/:source/videos', async (req, res) => {
    const { source } = req.params;
    const { url } = req.query;
    const startTime = Date.now();
    if (!url) return res.status(400).json({ error: "Missing required 'url' parameter" });

    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) {
            if (global._logStreamer) global._logStreamer.sendLog('API', 'error', `Source '${source}' not found for /videos`);
            return res.status(404).json({ error: `Source '${source}' not found` });
        }
        
        const extName = ext.metadata[0]?.name || source;
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/videos url='${url}' on '${extName}'`);
        }

        const result = await withTimeout(ext.instance.getVideoList(url), EXEC_TIMEOUT_MS, 'getVideoList');
        const elapsed = Date.now() - startTime;
        const videoCount = Array.isArray(result) ? result.length : 0;

        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'info', `GET /api/${source}/videos on '${extName}' completed in ${elapsed}ms (${videoCount} streams)`);
        }

        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/videos:`, e);
        if (global._logStreamer) {
            global._logStreamer.sendLog('API', 'error', `GET /api/${source}/videos failed: ${e.message}`);
        }
        res.status(500).json({ error: e.message });
    }
});

// Video Stream Proxy Endpoint (Bypasses CORS & Referer hotlinking restrictions in web browsers)
app.options('/api/proxy/video', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.sendStatus(204);
});

app.get('/api/proxy/video', async (req, res) => {
    const { url, referer, userAgent } = req.query;
    if (!url) return res.status(400).json({ error: "Missing required 'url' parameter" });

    // Explicitly set wildcard CORS headers so web players (Chrome, Firefox, Edge) decode streams cleanly
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    try {
        const fetchHeaders = {
            'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
            'Referer': referer || 'https://hentaiocean.com/'
        };

        if (req.headers.range) {
            fetchHeaders['Range'] = req.headers.range;
        }

        const fetchRes = await fetch(url, { headers: fetchHeaders });

        res.status(fetchRes.status);
        const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
        forwardHeaders.forEach(h => {
            const val = fetchRes.headers.get(h);
            if (val) res.setHeader(h, val);
        });

        const { Readable } = require('stream');
        Readable.fromWeb(fetchRes.body).pipe(res);
    } catch (e) {
        console.error('Video proxy error:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- Dev Tester Endpoints ---

// List all sources grouped by directory environment
app.get('/api/test/sources', (req, res) => {
    const sources = Array.from(new Set(Array.from(sourceCache.values()).map(s => JSON.stringify({
        name: s.name,
        id: s.id,
        lang: s.lang,
        version: s.version,
        baseUrl: s.baseUrl,
        iconUrl: s.iconUrl,
        isNsfw: s.isNsfw,
        group: s.group,
        fileName: s.fileName
    })))).map(s => JSON.parse(s));
    res.json(sources);
});

// Fetch source code for a specific extension
app.get('/api/test/code', (req, res) => {
    const { group, source } = req.query;
    if (!group || !source) {
        return res.status(400).json({ error: "Missing required 'group' or 'source' parameter" });
    }
    let info = sourceCache.get(`${group}/${String(source).toLowerCase()}`);
    if (!info) {
        info = sourceCache.get(String(source).toLowerCase());
    }
    if (!info) {
        return res.status(404).json({ error: `Source '${source}' in group '${group}' not found` });
    }
    try {
        const code = fs.readFileSync(info.filePath, 'utf8');
        res.json({ code, filePath: info.filePath, name: info.name, id: info.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Save updated source code back to the file system
app.post('/api/test/code', (req, res) => {
    const { group, source, code } = req.body;
    if (!group || !source || code === undefined) {
        return res.status(400).json({ error: "Missing required 'group', 'source', or 'code' parameter" });
    }
    const info = sourceCache.get(`${group}/${String(source).toLowerCase()}`);
    if (!info) {
        return res.status(404).json({ error: `Source '${source}' in group '${group}' not found` });
    }
    try {
        fs.writeFileSync(info.filePath, code, 'utf8');
        // Re-initialize cache to parse the updated file and metadata
        initCache();
        res.json({ success: true, message: `Saved and reloaded ${info.name}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// HTTP endpoint for clients to push log messages directly
app.post('/api/log', (req, res) => {
    const { source, level, message, meta } = req.body;
    if (global._logStreamer) {
        global._logStreamer.sendLog(source || 'Client', level || 'info', message || '', meta || {});
    }
    res.json({ success: true });
});

// Execute a specific scraper action and collect console logs
app.post('/api/test/run', async (req, res) => {
    const { group, source, action, params, preferences } = req.body;
    if (!group || !source || !action) {
        return res.status(400).json({ error: "Missing required 'group', 'source', or 'action' parameter" });
    }

    const requestLogs = [];
    const logCallback = (level, message) => {
        requestLogs.push({ level, message, time: new Date().toLocaleTimeString() });
    };

    let info = sourceCache.get(`${group}/${String(source).toLowerCase()}`);
    if (!info) {
        info = sourceCache.get(String(source).toLowerCase());
    }
    if (!info) {
        return res.status(404).json({ error: `Source '${source}' in group '${group}' not found` });
    }

    if (global._logStreamer) {
        global._logStreamer.sendLog('Tester', 'info', `Executing action '${action}' on '${info.name}' [${group}]`);
    }

    try {
        const ext = loadExtension(info.filePath, preferences || {}, logCallback);
        if (!ext) {
            return res.status(500).json({ error: "Failed to load extension" });
        }

        const startTime = Date.now();
        let result;

        switch (action) {
            case 'getPopular': {
                const page = parseInt(params?.page || '1', 10);
                result = await withTimeout(ext.instance.getPopular(page), EXEC_TIMEOUT_MS, 'getPopular');
                break;
            }
            case 'getLatestUpdates': {
                const page = parseInt(params?.page || '1', 10);
                result = await withTimeout(ext.instance.getLatestUpdates(page), EXEC_TIMEOUT_MS, 'getLatestUpdates');
                break;
            }
            case 'search': {
                const query = params?.query || '';
                const page = parseInt(params?.page || '1', 10);
                let filters = [];
                if (params?.filters) {
                    filters = typeof params.filters === 'string' ? JSON.parse(params.filters) : params.filters;
                }
                result = await withTimeout(ext.instance.search(query, page, filters), EXEC_TIMEOUT_MS, 'search');
                break;
            }
            case 'getDetail': {
                const url = params?.url;
                if (!url) throw new Error("Missing required parameter 'url' for getDetail");
                result = await withTimeout(ext.instance.getDetail(url), EXEC_TIMEOUT_MS, 'getDetail');
                break;
            }
            case 'getVideoList': {
                const url = params?.url;
                if (!url) throw new Error("Missing required parameter 'url' for getVideoList");
                result = await withTimeout(ext.instance.getVideoList(url), EXEC_TIMEOUT_MS, 'getVideoList');
                break;
            }
            case 'getFilterList': {
                if (typeof ext.instance.getFilterList === 'function') {
                    result = await withTimeout(ext.instance.getFilterList(), EXEC_TIMEOUT_MS, 'getFilterList');
                } else {
                    result = [];
                    logCallback('info', 'getFilterList method is not defined in this extension');
                }
                break;
            }
            case 'getSourcePreferences': {
                if (typeof ext.instance.getSourcePreferences === 'function') {
                    result = await withTimeout(ext.instance.getSourcePreferences(), EXEC_TIMEOUT_MS, 'getSourcePreferences');
                } else {
                    result = [];
                    logCallback('info', 'getSourcePreferences method is not defined in this extension');
                }
                break;
            }
            default:
                throw new Error(`Unsupported action '${action}'`);
        }

        const executionTimeMs = Date.now() - startTime;

        if (global._logStreamer) {
            const itemCount = Array.isArray(result) ? result.length : (result?.list?.length || (result ? 1 : 0));
            global._logStreamer.sendLog('Tester', 'info', `Action '${action}' on '${info.name}' completed in ${executionTimeMs}ms (${itemCount} items)`);
        }

        res.json({
            success: true,
            result,
            logs: requestLogs,
            executionTimeMs
        });
    } catch (e) {
        console.error(`Error running action '${action}' on '${source}':`, e);
        if (global._logStreamer) {
            global._logStreamer.sendLog('Tester', 'error', `Action '${action}' on '${info.name}' failed: ${e.message}`);
        }
        res.status(500).json({
            success: false,
            error: e.message,
            logs: requestLogs
        });
    }
});
// --- Health Check Endpoint ---
app.get('/api/health', async (req, res) => {
    const group = req.query.group || null;
    const results = [];
    const groups = group ? { [group]: directories[group] } : directories;

    for (const [grp, dirPath] of Object.entries(groups)) {
        if (!dirPath || !fs.existsSync(dirPath)) continue;
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            const entry = { group: grp, fileName: file, status: 'unknown', name: file };
            try {
                const { metadata } = loadExtension(fullPath);
                const meta = metadata[0];
                if (meta) {
                    entry.name = meta.name;
                    entry.id = meta.id;
                    entry.version = meta.version;
                    entry.baseUrl = meta.baseUrl;
                    entry.isNsfw = meta.isNsfw;
                    entry.status = 'loaded';
                }
            } catch (e) {
                entry.status = 'error';
                entry.error = e.message;
            }
            results.push(entry);
        }
    }

    const loaded = results.filter(r => r.status === 'loaded').length;
    const errors = results.filter(r => r.status === 'error').length;

    res.json({
        timestamp: new Date().toISOString(),
        summary: { total: results.length, loaded, errors },
        extensions: results,
        websocket: global._logStreamer ? global._logStreamer.getStats() : null
    });
});

// --- Live Health Check (tests getPopular on each extension) ---
app.get('/api/health/live', async (req, res) => {
    const group = req.query.group || 'development';
    const dirPath = directories[group];
    if (!dirPath || !fs.existsSync(dirPath)) {
        return res.status(404).json({ error: `Group '${group}' not found` });
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
    const results = [];

    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const entry = { fileName: file, group, status: 'unknown' };
        try {
            const ext = loadExtension(fullPath);
            entry.name = ext.metadata[0]?.name || file;
            const startTime = Date.now();
            const result = await withTimeout(ext.instance.getPopular(1), 10000, 'getPopular');
            entry.executionTimeMs = Date.now() - startTime;
            entry.itemCount = result?.list?.length || 0;
            entry.status = entry.itemCount > 0 ? 'healthy' : 'empty';
        } catch (e) {
            entry.status = 'error';
            entry.error = e.message;
        }
        results.push(entry);
    }

    res.json({
        timestamp: new Date().toISOString(),
        group,
        results
    });
});

// --- WebSocket Stats Endpoint ---
app.get('/api/ws/stats', (req, res) => {
    if (global._logStreamer) {
        res.json(global._logStreamer.getStats());
    } else {
        res.json({ connectedClients: 0, historySize: 0, path: '/ws/logs' });
    }
});

// --- Production Metrics Endpoint ---
app.get('/api/metrics', (req, res) => {
    const memUsage = process.memoryUsage();
    res.json({
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        memory: {
            rssFormatted: (memUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
            heapTotalFormatted: (memUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
            heapUsedFormatted: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
            externalFormatted: (memUsage.external / 1024 / 1024).toFixed(2) + ' MB',
            raw: memUsage
        },
        sourcesCount: sourceCache.size / 2,
        compiledScriptsCount: scriptCache.size,
        cacheStats: globalResponseCache.getStats(),
        websocketStats: global._logStreamer ? global._logStreamer.getStats() : null
    });
});

// --- Extension Repository Management Endpoints ---
app.get('/api/repos', (req, res) => {
    try {
        const repos = repositoryDb.getAllRepos();
        res.json(repos);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/repos/add', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: "Missing required 'url' parameter" });
    }
    try {
        console.log(`[API] Adding repository: ${url}`);
        const result = await addOrSyncRepo(url);
        initCache();
        console.log(`[API] Repository added successfully (${result.installedCount} extensions)`);
        res.json(result);
    } catch (e) {
        console.error(`[API] Add repository failed: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/repos', (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: "Missing required 'url' parameter" });
    }
    try {
        console.log(`[API] Removing repository: ${url}`);
        const result = removeRepo(url);
        initCache();
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/repos/sync', async (req, res) => {
    try {
        console.log(`[API] Syncing all repositories...`);
        const result = await syncAllRepos();
        initCache();
        res.json({ success: true, results: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Cache Management Endpoints ---
app.get('/api/cache/stats', (req, res) => {
    res.json(globalResponseCache.getStats());
});

app.post('/api/cache/clear', (req, res) => {
    globalResponseCache.clear();
    res.json({ success: true, message: 'Response cache cleared', stats: globalResponseCache.getStats() });
});

// --- Watch History & Favorites Endpoints ---

// Get watch history
app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit || '50', 10);
    const extensionId = req.query.extensionId || null;
    const history = watchHistory.getRecent(limit, extensionId);
    res.json(history);
});

// Upsert watch progress
app.post('/api/history', (req, res) => {
    const { extensionId, extensionName, animeUrl, animeName, animeImage, episodeUrl, episodeName, episodeNumber, progress, duration } = req.body;
    if (!extensionId || !episodeUrl) {
        return res.status(400).json({ error: "Missing required 'extensionId' or 'episodeUrl'" });
    }
    watchHistory.upsert({ extensionId, extensionName, animeUrl, animeName, animeImage, episodeUrl, episodeName, episodeNumber, progress, duration });
    res.json({ success: true });
});

// Delete single history entry
app.delete('/api/history/:id', (req, res) => {
    watchHistory.delete(req.params.id);
    res.json({ success: true });
});

// Clear all watch history
app.delete('/api/history', (req, res) => {
    watchHistory.clearAll();
    res.json({ success: true });
});

// Proxy image requests to bypass browser referrer / CORS / hotlinking blocks in Playground
app.get('/api/proxy-image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('Missing url query param');
    try {
        const fetchOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': req.query.referer || 'https://hanime1.me/'
            }
        };
        const resp = await fetch(imageUrl, fetchOptions);
        if (!resp.ok) {
            return res.status(resp.status).send(`Failed to fetch image: ${resp.statusText}`);
        }
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const buffer = Buffer.from(await resp.arrayBuffer());
        res.send(buffer);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Get favorites/library
app.get('/api/favorites', (req, res) => {
    const extensionId = req.query.extensionId || null;
    const items = favorites.getAll(extensionId);
    res.json(items);
});

// Add to favorites
app.post('/api/favorites', (req, res) => {
    const { extensionId, extensionName, animeUrl, animeName, animeImage } = req.body;
    if (!extensionId || !animeUrl) {
        return res.status(400).json({ error: "Missing required 'extensionId' or 'animeUrl'" });
    }
    favorites.add({ extensionId, extensionName, animeUrl, animeName, animeImage });
    res.json({ success: true });
});

// Check or remove favorite
app.delete('/api/favorites', (req, res) => {
    const { extensionId, animeUrl, id } = req.query;
    if (id) {
        favorites.delete(id);
    } else if (extensionId && animeUrl) {
        favorites.remove(extensionId, animeUrl);
    } else {
        return res.status(400).json({ error: "Missing 'id' or 'extensionId' + 'animeUrl'" });
    }
    res.json({ success: true });
});

// Check if anime is favorited
app.get('/api/favorites/check', (req, res) => {
    const { extensionId, animeUrl } = req.query;
    if (!extensionId || !animeUrl) return res.json({ isFavorite: false });
    const isFav = favorites.isFavorite(extensionId, animeUrl);
    res.json({ isFavorite: isFav });
});

// Get extension preferences
app.get('/api/preferences/:extensionId', (req, res) => {
    const prefs = preferencesDb.getAllForExtension(req.params.extensionId);
    res.json(prefs);
});

// Set extension preference
app.post('/api/preferences/:extensionId', (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "Missing required 'key'" });
    const prefStore = new PersistentSharedPreferences(req.params.extensionId);
    prefStore.set(key, value);
    res.json({ success: true });
});

// --- Smart Template & Workflow Endpoints ---

// 1. List available templates
app.get('/api/templates', (req, res) => {
    res.json(listTemplates().filter(t => !t.hidden));
});

// 2. Scaffold a new extension
app.post('/api/scaffold', (req, res) => {
    const { name, baseUrl, apiUrl, template, outputGroup } = req.body;
    if (!name || !baseUrl) {
        return res.status(400).json({ error: "Missing required 'name' or 'baseUrl' parameter" });
    }

    const group = outputGroup || 'development';
    const outputDir = directories[group];
    if (!outputDir) {
        return res.status(400).json({ error: `Invalid outputGroup '${group}'` });
    }

    try {
        const result = generateSkeleton({
            name,
            baseUrl,
            apiUrl,
            template: template || 'api-json',
            outputDir
        });

        // Refresh source cache so the new extension is immediately testable
        initCache();

        res.json({
            success: true,
            message: `Scaffolded ${name} using '${result.template}' template`,
            result
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Validate single extension or whole group
app.post('/api/validate', (req, res) => {
    const { source, group } = req.body;
    const targetGroup = group || 'development';

    if (source) {
        // Validate single extension
        const info = sourceCache.get(`${targetGroup}/${String(source).toLowerCase()}`);
        let targetPath = source;
        if (info) {
            targetPath = info.filePath;
        } else if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: `Source '${source}' not found in group '${targetGroup}'` });
        }

        const report = validateExtension(targetPath, { targetGroup });
        res.json(report);
    } else {
        // Validate whole directory/group
        const dirPath = directories[targetGroup];
        if (!dirPath || !fs.existsSync(dirPath)) {
            return res.status(404).json({ error: `Group '${targetGroup}' directory not found` });
        }

        const report = validateDirectory(dirPath, { targetGroup });
        res.json(report);
    }
});

// 4. Deploy extension from dev to target prod group
app.post('/api/deploy', (req, res) => {
    const { source, targetGroup, dryRun, force } = req.body;
    if (!source || !targetGroup) {
        return res.status(400).json({ error: "Missing required 'source' or 'targetGroup' parameter" });
    }

    const info = sourceCache.get(`development/${String(source).toLowerCase()}`)
        || sourceCache.get(String(source).toLowerCase());

    let sourcePath = source;
    if (info) {
        sourcePath = info.filePath;
    } else if (!fs.existsSync(sourcePath)) {
        return res.status(404).json({ error: `Source '${source}' not found in development group` });
    }

    try {
        const result = deployExtension(sourcePath, targetGroup, { dryRun: !!dryRun, force: !!force });

        if (result.success && !dryRun) {
            // Re-initialize source cache to index the newly deployed file
            initCache();
        }

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
const logStreamer = new LogStreamer(server);
global._logStreamer = logStreamer;

// Listen on all network interfaces
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mangayomi Runner server running on port ${PORT}`);
    console.log(`WebSocket log streaming at ws://localhost:${PORT}/ws/logs`);
    console.log(`Health dashboard at http://localhost:${PORT}/dashboard.html`);
    console.log(`Metrics endpoint available at http://localhost:${PORT}/api/metrics`);
});

// --- Graceful Shutdown ---
function gracefulShutdown(signal) {
    console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
    watcher.stop();
    closeDb();
    server.close(() => {
        console.log('[Server] HTTP and WebSocket server closed cleanly.');
        process.exit(0);
    });

    // Force exit if shutdown hangs
    setTimeout(() => {
        console.error('[Server] Could not close connections in time, forcing shut down.');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

