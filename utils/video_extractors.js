/**
 * Video Extractor Utilities
 * 
 * Reusable extraction helpers that extensions can call for common
 * video hosting patterns. These run inside the VM sandbox alongside
 * the extension code and use the same Client/Document APIs.
 * 
 * Extensions typically do their own extraction inline, but these
 * helpers are available as global functions for new extensions or
 * refactoring existing ones.
 */

const { HttpClient } = require('./http_client');
const CryptoJS = require('crypto-js');

/**
 * Parse an M3U8 master playlist and return individual quality streams.
 * @param {string} m3u8Content - Raw M3U8 content text
 * @param {string} baseUrl - Base URL for resolving relative paths
 * @returns {Array} Array of {url, quality} objects
 */
function parseM3U8Qualities(m3u8Content, baseUrl = '') {
    const streams = [];
    if (!m3u8Content || typeof m3u8Content !== 'string') return streams;

    const lines = m3u8Content.split('\n').map(l => l.trim()).filter(l => l);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            // Parse resolution/bandwidth from the info tag
            const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
            const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
            const nameMatch = line.match(/NAME="([^"]+)"/i);

            let quality = 'Auto';
            if (resMatch) {
                quality = resMatch[1];
            } else if (nameMatch) {
                quality = nameMatch[1];
            } else if (bwMatch) {
                const bw = parseInt(bwMatch[1], 10);
                if (bw > 4000000) quality = '1080p';
                else if (bw > 2000000) quality = '720p';
                else if (bw > 1000000) quality = '480p';
                else quality = '360p';
            }

            // Next non-comment line is the URL
            const nextLine = lines[i + 1];
            if (nextLine && !nextLine.startsWith('#')) {
                let streamUrl = nextLine;
                if (!streamUrl.startsWith('http')) {
                    // Resolve relative URL
                    try {
                        streamUrl = new URL(nextLine, baseUrl).href;
                    } catch {
                        streamUrl = baseUrl.replace(/\/[^/]*$/, '/') + nextLine;
                    }
                }
                streams.push({
                    url: streamUrl,
                    originalUrl: streamUrl,
                    quality: quality
                });
                i++; // Skip the URL line
            }
        }
    }

    // If no stream-inf found, it might be a direct playlist — return as single stream
    if (streams.length === 0 && m3u8Content.includes('#EXTINF')) {
        streams.push({
            url: baseUrl,
            originalUrl: baseUrl,
            quality: 'Default'
        });
    }

    return streams;
}

/**
 * Extract direct video URLs from common hosting embed pages.
 * Works for generic patterns like file: "url" or source src="url".
 * @param {string} html - HTML content of embed page
 * @returns {Array} Array of {url, quality} objects
 */
function extractDirectVideoUrls(html) {
    const videos = [];
    if (!html || typeof html !== 'string') return videos;

    // Pattern: file:"url" or sources:[{file:"url"}]
    const filePatterns = [
        /file\s*:\s*["']([^"']+\.(?:mp4|m3u8|mkv)[^"']*?)["']/gi,
        /src\s*:\s*["']([^"']+\.(?:mp4|m3u8|mkv)[^"']*?)["']/gi,
        /source\s+src=["']([^"']+\.(?:mp4|m3u8|mkv)[^"']*?)["']/gi,
        /video_url\s*[:=]\s*["']([^"']+)["']/gi,
        /player\.src\(\s*{\s*src\s*:\s*["']([^"']+)["']/gi
    ];

    for (const pattern of filePatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1];
            if (url && url.startsWith('http')) {
                const ext = url.includes('.m3u8') ? 'HLS' : url.includes('.mp4') ? 'MP4' : 'Video';
                videos.push({
                    url: url,
                    originalUrl: url,
                    quality: ext
                });
            }
        }
    }

    return videos;
}

/**
 * Extract JW Player source URLs from HTML/JS.
 * @param {string} content - HTML or JS content
 * @returns {Array} Array of {url, quality} objects
 */
function extractJWPlayerSources(content) {
    const videos = [];
    if (!content || typeof content !== 'string') return videos;

    // Try to find jwplayer setup JSON
    const setupMatch = content.match(/jwplayer\s*\([^)]*\)\s*\.setup\s*\(\s*({[\s\S]*?})\s*\)/);
    if (setupMatch) {
        try {
            // Try parsing as JSON (won't always work due to JS object syntax)
            const config = JSON.parse(setupMatch[1].replace(/'/g, '"').replace(/(\w+)\s*:/g, '"$1":'));
            if (config.sources) {
                for (const src of config.sources) {
                    videos.push({
                        url: src.file || src.src,
                        originalUrl: src.file || src.src,
                        quality: src.label || src.type || 'Auto'
                    });
                }
            } else if (config.file) {
                videos.push({
                    url: config.file,
                    originalUrl: config.file,
                    quality: 'Auto'
                });
            }
        } catch {
            // Fallback: regex for file within setup
            const fileMatch = setupMatch[1].match(/file\s*:\s*["']([^"']+)["']/);
            if (fileMatch) {
                videos.push({
                    url: fileMatch[1],
                    originalUrl: fileMatch[1],
                    quality: 'Auto'
                });
            }
        }
    }

    return videos;
}

/**
 * Extract video URL from a packed/obfuscated script.
 * Handles eval(function(p,a,c,k,e,d){...}) packed scripts.
 * @param {string} html - HTML content
 * @param {Function} unpackJs - The unpacker function
 * @returns {Array} Array of {url, quality} objects
 */
function extractFromPackedScript(html, unpackJs) {
    const videos = [];
    if (!html || typeof html !== 'string' || typeof unpackJs !== 'function') return videos;

    // Find packed eval blocks
    const packedPattern = /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\(['"]([\s\S]*?)['"],\s*\d+,\s*\d+,\s*['"]([\s\S]*?)['"]/g;
    let match;
    while ((match = packedPattern.exec(html)) !== null) {
        try {
            const unpacked = unpackJs(match[0]);
            if (unpacked) {
                const directUrls = extractDirectVideoUrls(unpacked);
                videos.push(...directUrls);
            }
        } catch {
            // Ignore unpack failures
        }
    }

    return videos;
}

module.exports = {
    parseM3U8Qualities,
    extractDirectVideoUrls,
    extractJWPlayerSources,
    extractFromPackedScript
};
