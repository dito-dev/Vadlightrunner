/**
 * VadLightrunner Extension Repository Manager
 * 
 * Manages remote extension repositories (Mangayomi index.json format, raw GitHub repos, or standalone .js URLs).
 * Downloads and stores JS extensions in data/extensions/ so they are immediately available to VadLightrunner.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { repositoryDb } = require('./database');
const { loadExtension } = require('../emulator');

const DATA_EXTENSIONS_DIR = path.join(__dirname, '..', 'data', 'extensions');

// Ensure data extensions directory exists
if (!fs.existsSync(DATA_EXTENSIONS_DIR)) {
    fs.mkdirSync(DATA_EXTENSIONS_DIR, { recursive: true });
}

function sanitizeSlug(str) {
    return (str || 'repo').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

/**
 * Normalizes input URL to attempt fetching index.json or direct raw JS.
 */
function normalizeRepoUrl(inputUrl) {
    let url = (inputUrl || '').trim();
    if (!url) throw new Error('Repository URL cannot be empty');

    // Convert github.com/user/repo to raw github index.json URL
    if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
        url = url.replace('github.com', 'raw.githubusercontent.com')
                 .replace(/\/tree\/[^\/]+/, '')
                 .replace(/\/blob\/[^\/]+/, '');
        if (!url.endsWith('.json') && !url.endsWith('.js')) {
            url = url.replace(/\/$/, '') + '/main/index.json';
        }
    }
    return url;
}

/**
 * Fetches and processes an extension repository URL.
 */
async function addOrSyncRepo(inputUrl) {
    const rawUrl = (inputUrl || '').trim();
    const targetUrl = normalizeRepoUrl(rawUrl);

    console.log(`[RepoManager] Fetching repository index from: ${targetUrl}`);

    let indexData;
    let repoName = 'Custom Repository';

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*'
            },
            timeout: 15000
        });
        indexData = response.data;
    } catch (err) {
        // Fallback check for index.min.json if index.json 404s
        if (targetUrl.endsWith('/index.json')) {
            const fallbackUrl = targetUrl.replace('/index.json', '/index.min.json');
            try {
                const response = await axios.get(fallbackUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 15000
                });
                indexData = response.data;
            } catch {
                throw new Error(`Failed to fetch repository index from ${targetUrl}: ${err.message}`);
            }
        } else {
            throw new Error(`Failed to fetch repository index from ${targetUrl}: ${err.message}`);
        }
    }

    // Prepare repo storage folder
    const repoSlug = sanitizeSlug(targetUrl);
    const repoSubDir = path.join(DATA_EXTENSIONS_DIR, repoSlug);
    if (!fs.existsSync(repoSubDir)) {
        fs.mkdirSync(repoSubDir, { recursive: true });
    }

    let extensionList = [];

    // Case 1: Response is JSON array (Mangayomi index.json)
    if (Array.isArray(indexData)) {
        extensionList = indexData;
        try {
            const parsedUrl = new URL(targetUrl);
            repoName = parsedUrl.hostname + parsedUrl.pathname.replace('/index.json', '');
        } catch {}
    } 
    // Case 2: Response is JSON object with `extensions` array
    else if (typeof indexData === 'object' && indexData !== null && Array.isArray(indexData.extensions)) {
        extensionList = indexData.extensions;
        repoName = indexData.name || repoName;
    } 
    // Case 3: Direct JS extension script URL
    else if (typeof indexData === 'string' && (targetUrl.endsWith('.js') || indexData.includes('class DefaultExtension') || indexData.includes('mangayomiSources'))) {
        const fileName = path.basename(targetUrl) || 'custom_ext.js';
        extensionList = [{
            name: fileName.replace('.js', ''),
            code: indexData,
            sourceCodeUrl: targetUrl
        }];
    } else {
        throw new Error('Invalid repository index format. Expected JSON array or JS extension file.');
    }

    console.log(`[RepoManager] Found ${extensionList.length} extensions in repo '${repoName}'`);

    // Register repo in database immediately so it appears in Installed Repositories list for removal
    repositoryDb.addRepo(rawUrl, repoName, 0);

    const installed = [];
    const errors = [];

    const baseUrlDir = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

    for (const ext of extensionList) {
        try {
            // Check if extension is explicitly tagged as Dart (sourceCodeLanguage === 0)
            if (ext.sourceCodeLanguage === 0) {
                errors.push(`${ext.name || 'Unknown'}: Dart extension skipped (VadLightrunner requires JavaScript extensions).`);
                continue;
            }

            let code = ext.code;
            let downloadUrl = ext.sourceCodeUrl || ext.url || ext.pkgPath;

            if (downloadUrl && (downloadUrl.endsWith('.dart') || downloadUrl.includes('/dart/'))) {
                errors.push(`${ext.name || 'Unknown'}: Dart source URL skipped.`);
                continue;
            }

            if (!code && downloadUrl) {
                if (!downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://')) {
                    downloadUrl = baseUrlDir + downloadUrl.replace(/^\//, '');
                }
                const jsRes = await axios.get(downloadUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 15000,
                    responseType: 'text'
                });
                code = jsRes.data;
            }

            if (!code || typeof code !== 'string') {
                errors.push(`${ext.name || 'Unknown'}: No JS source code retrieved`);
                continue;
            }

            // Check if downloaded code is actually Dart code
            if (code.includes("import 'package:mangayomi") || code.includes("import 'dart:")) {
                errors.push(`${ext.name || 'Unknown'}: Contains Dart code. Skipping.`);
                continue;
            }

            const extFileName = sanitizeSlug(ext.name || ext.id || 'ext') + '.js';
            const savePath = path.join(repoSubDir, extFileName);
            fs.writeFileSync(savePath, code, 'utf-8');

            // Load & validate in emulator to extract metadata
            const { metadata } = loadExtension(savePath);
            const meta = metadata[0] || {};

            const extMeta = {
                repoUrl: rawUrl,
                extensionId: String(meta.id || ext.id || extFileName),
                extensionName: meta.name || ext.name || extFileName,
                filePath: savePath,
                version: meta.version || ext.version || '1.0.0',
                lang: meta.lang || ext.lang || 'en',
                isNsfw: meta.isNsfw ?? ext.isNsfw ?? false,
                itemType: meta.itemType ?? ext.itemType ?? 1,
                baseUrl: meta.baseUrl || ext.baseUrl || '',
                iconUrl: meta.iconUrl || ext.iconUrl || ''
            };

            repositoryDb.saveExtension(extMeta);
            installed.push(extMeta);
        } catch (e) {
            console.error(`[RepoManager] Error installing extension ${ext.name}:`, e.message);
            errors.push(`${ext.name || 'Unknown'}: ${e.message}`);
        }
    }

    repositoryDb.addRepo(rawUrl, repoName, installed.length);

    return {
        success: true,
        repoUrl: rawUrl,
        name: repoName,
        installedCount: installed.length,
        installedExtensions: installed,
        errors
    };
}

/**
 * Removes a repository and cleans up its downloaded files.
 */
function removeRepo(rawUrl) {
    const filePaths = repositoryDb.removeRepo(rawUrl);
    for (const fp of filePaths) {
        try {
            if (fs.existsSync(fp)) {
                fs.unlinkSync(fp);
            }
        } catch (e) {
            console.warn(`[RepoManager] Failed to remove file ${fp}:`, e.message);
        }
    }
    return { success: true, removedCount: filePaths.length };
}

/**
 * Syncs all saved repositories in database.
 */
async function syncAllRepos() {
    const repos = repositoryDb.getAllRepos();
    const results = [];
    for (const repo of repos) {
        try {
            const res = await addOrSyncRepo(repo.url);
            results.push(res);
        } catch (e) {
            results.push({ success: false, repoUrl: repo.url, error: e.message });
        }
    }
    return results;
}

module.exports = {
    addOrSyncRepo,
    removeRepo,
    syncAllRepos,
    DATA_EXTENSIONS_DIR
};
