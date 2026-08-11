/**
 * Extension Validator Utility
 * 
 * Performs structural, contract, and deployment readiness validation on
 * Mangayomi extension files. Identifies critical errors and warnings to ensure
 * extensions comply with the Mangayomi runner specification.
 */

const fs = require('fs');
const path = require('path');
const { loadExtension } = require('../emulator');

/**
 * Validate a single extension file.
 * 
 * @param {string} filePath - Absolute or relative path to the extension .js file
 * @param {Object} options - Validation options
 * @param {string} [options.targetGroup] - Optional deployment group ('development', 'prod-safe', 'prod-nsfw', 'prod-real')
 * @returns {Object} Validation report object
 */
function validateExtension(filePath, options = {}) {
    const absolutePath = path.resolve(filePath);
    const fileName = path.basename(absolutePath);

    const errors = [];
    const warnings = [];

    // 1. File existence check
    if (!fs.existsSync(absolutePath)) {
        return {
            filePath: absolutePath,
            fileName,
            valid: false,
            score: 0,
            errors: [{ code: 'ERR_FILE_NOT_FOUND', message: `File does not exist: ${absolutePath}` }],
            warnings: [],
            meta: null
        };
    }

    // 2. Syntax & Instantiation check via VM sandbox
    let loaded;
    try {
        loaded = loadExtension(absolutePath);
    } catch (e) {
        return {
            filePath: absolutePath,
            fileName,
            valid: false,
            score: 0,
            errors: [{ code: 'ERR_SYNTAX_OR_LOAD', message: `Extension failed to load in VM: ${e.message}` }],
            warnings: [],
            meta: null
        };
    }

    const { instance, metadata } = loaded;

    // 3. Metadata validation (mangayomiSources)
    if (!metadata || !Array.isArray(metadata) || metadata.length === 0) {
        errors.push({ code: 'ERR_NO_METADATA', message: "'mangayomiSources' array is missing or empty" });
    } else {
        const meta = metadata[0];

        // Required fields
        if (!meta.name || typeof meta.name !== 'string' || meta.name.trim() === '') {
            errors.push({ code: 'ERR_MISSING_NAME', message: "Metadata field 'name' is missing or empty" });
        }
        if (!meta.baseUrl || typeof meta.baseUrl !== 'string' || meta.baseUrl.trim() === '') {
            errors.push({ code: 'ERR_MISSING_BASE_URL', message: "Metadata field 'baseUrl' is missing or empty" });
        } else if (!meta.baseUrl.startsWith('http://') && !meta.baseUrl.startsWith('https://')) {
            errors.push({ code: 'ERR_INVALID_BASE_URL', message: `Metadata field 'baseUrl' must start with http:// or https:// (got '${meta.baseUrl}')` });
        }

        if (meta.id === undefined || meta.id === null || typeof meta.id !== 'number' || isNaN(meta.id)) {
            errors.push({ code: 'ERR_INVALID_ID', message: "Metadata field 'id' must be a valid number" });
        } else if (meta.id <= 0) {
            warnings.push({ code: 'WARN_ID_ZERO_OR_NEGATIVE', message: `Metadata field 'id' is ${meta.id}, usually expected to be a positive integer` });
        }

        if (!meta.lang || typeof meta.lang !== 'string') {
            warnings.push({ code: 'WARN_MISSING_LANG', message: "Metadata field 'lang' is missing (defaults to 'en')" });
        }

        if (!meta.version || typeof meta.version !== 'string') {
            warnings.push({ code: 'WARN_MISSING_VERSION', message: "Metadata field 'version' is missing (recommended semver e.g., '0.0.1')" });
        }

        if (meta.isManga === undefined || meta.isManga === null || typeof meta.isManga !== 'boolean') {
            errors.push({ code: 'ERR_MISSING_IS_MANGA', message: "Metadata field 'isManga' must be a boolean" });
        }

        if (meta.itemType === undefined || meta.itemType === null || typeof meta.itemType !== 'number') {
            errors.push({ code: 'ERR_MISSING_ITEM_TYPE', message: "Metadata field 'itemType' must be a number (0=Manga, 1=Anime)" });
        } else if (meta.isManga === true && meta.itemType !== 0) {
            errors.push({ code: 'ERR_MISMATCH_ITEM_TYPE', message: "Metadata mismatch: 'isManga' is true but 'itemType' is not 0" });
        } else if (meta.isManga === false && meta.itemType !== 1) {
            errors.push({ code: 'ERR_MISMATCH_ITEM_TYPE', message: "Metadata mismatch: 'isManga' is false but 'itemType' is not 1" });
        }

        // Warnings for optional / deployment fields
        if (!meta.iconUrl || meta.iconUrl.includes('favicon.ico') || meta.iconUrl.trim() === '') {
            warnings.push({ code: 'WARN_DEFAULT_ICON', message: "Icon URL is empty or uses default favicon.ico" });
        }

        if (!meta.sourceCodeUrl || meta.sourceCodeUrl.trim() === '') {
            warnings.push({ code: 'WARN_EMPTY_SOURCE_URL', message: "'sourceCodeUrl' is empty" });
        } else if (meta.sourceCodeUrl.includes('example.com') || meta.sourceCodeUrl.includes('placeholder')) {
            warnings.push({ code: 'WARN_PLACEHOLDER_SOURCE_URL', message: `'sourceCodeUrl' contains placeholder text ('${meta.sourceCodeUrl}')` });
        }

        if (!meta.pkgPath || meta.pkgPath.trim() === '') {
            warnings.push({ code: 'WARN_EMPTY_PKG_PATH', message: "'pkgPath' is empty" });
        }

        // Deployment group specific check
        if (options.targetGroup) {
            const group = options.targetGroup;
            if (group === 'prod-safe' && meta.isNsfw) {
                errors.push({ code: 'ERR_NSFW_IN_PROD_SAFE', message: "NSFW extension cannot be deployed to 'prod-safe' repository" });
            }
            if (group === 'prod-safe' && meta.pkgPath && !meta.pkgPath.startsWith('working/')) {
                warnings.push({ code: 'WARN_PKG_PATH_PROD_SAFE', message: `'pkgPath' for prod-safe should start with 'working/' (got '${meta.pkgPath}')` });
            }
            if ((group === 'prod-nsfw' || group === 'prod-real') && meta.pkgPath && !meta.pkgPath.startsWith('nsfw/') && !meta.pkgPath.startsWith('real/')) {
                warnings.push({ code: 'WARN_PKG_PATH_PROD_REAL', message: `'pkgPath' for ${group} should start with 'nsfw/' or 'real/' (got '${meta.pkgPath}')` });
            }
        }
    }

    // 4. Interface & Method Signature Checks
    if (!instance) {
        errors.push({ code: 'ERR_NO_INSTANCE', message: "Could not instantiate 'DefaultExtension' class" });
    } else {
        const isManga = metadata && metadata[0] ? metadata[0].isManga : false;

        // Core listing methods
        if (typeof instance.getPopular !== 'function') {
            errors.push({ code: 'ERR_MISSING_METHOD', message: "Required method 'getPopular(page)' is missing" });
        }
        if (typeof instance.getLatestUpdates !== 'function') {
            errors.push({ code: 'ERR_MISSING_METHOD', message: "Required method 'getLatestUpdates(page)' is missing" });
        }
        if (typeof instance.search !== 'function') {
            errors.push({ code: 'ERR_MISSING_METHOD', message: "Required method 'search(query, page, filters)' is missing" });
        }
        if (typeof instance.getDetail !== 'function') {
            errors.push({ code: 'ERR_MISSING_METHOD', message: "Required method 'getDetail(url)' is missing" });
        }

        // Content extraction methods based on extension type
        if (isManga) {
            if (typeof instance.getPageList !== 'function') {
                errors.push({ code: 'ERR_MISSING_METHOD', message: "Manga extension must define 'getPageList(url)'" });
            }
            if (typeof instance.getVideoList === 'function') {
                warnings.push({ code: 'WARN_UNEXPECTED_METHOD', message: "Manga extension defines 'getVideoList(url)' which won't be called" });
            }
        } else {
            if (typeof instance.getVideoList !== 'function') {
                errors.push({ code: 'ERR_MISSING_METHOD', message: "Anime extension must define 'getVideoList(url)'" });
            }
            if (typeof instance.getPageList === 'function') {
                warnings.push({ code: 'WARN_UNEXPECTED_METHOD', message: "Anime extension defines 'getPageList(url)' which won't be called" });
            }
        }

        // Recommended UI methods
        if (typeof instance.getFilterList !== 'function') {
            warnings.push({ code: 'WARN_MISSING_FILTERS', message: "Recommended method 'getFilterList()' is missing. Main app filter button will be disabled." });
        } else {
            try {
                const filters = instance.getFilterList();
                if (!Array.isArray(filters)) {
                    warnings.push({ code: 'WARN_INVALID_FILTERS', message: "'getFilterList()' did not return an array" });
                }
            } catch (e) {
                warnings.push({ code: 'WARN_FILTER_EXEC_ERROR', message: `'getFilterList()' threw an error when invoked: ${e.message}` });
            }
        }

        if (typeof instance.getSourcePreferences === 'function') {
            try {
                const prefs = instance.getSourcePreferences();
                if (!Array.isArray(prefs)) {
                    warnings.push({ code: 'WARN_INVALID_PREFS', message: "'getSourcePreferences()' did not return an array" });
                }
            } catch (e) {
                warnings.push({ code: 'WARN_PREFS_EXEC_ERROR', message: `'getSourcePreferences()' threw an error when invoked: ${e.message}` });
            }
        }
    }

    // 5. Score calculation (0 to 100)
    const score = Math.max(0, 100 - (errors.length * 25) - (warnings.length * 5));
    const meta = metadata && metadata[0] ? {
        name: metadata[0].name,
        id: metadata[0].id,
        version: metadata[0].version,
        baseUrl: metadata[0].baseUrl,
        isManga: metadata[0].isManga,
        isNsfw: metadata[0].isNsfw
    } : null;

    return {
        filePath: absolutePath,
        fileName,
        valid: errors.length === 0,
        score,
        errors,
        warnings,
        meta
    };
}

/**
 * Validate all extension files within a directory.
 * 
 * @param {string} dirPath - Path to directory containing .js extension files
 * @param {Object} options - Validation options
 * @returns {Object} Aggregate validation summary report
 */
function validateDirectory(dirPath, options = {}) {
    const absolutePath = path.resolve(dirPath);

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
        return {
            dirPath: absolutePath,
            total: 0,
            validCount: 0,
            invalidCount: 0,
            results: [],
            error: `Directory not found: ${absolutePath}`
        };
    }

    const files = fs.readdirSync(absolutePath).filter(f => f.endsWith('.js'));
    const results = files.map(file => validateExtension(path.join(absolutePath, file), options));

    const validCount = results.filter(r => r.valid).length;
    const invalidCount = results.filter(r => !r.valid).length;
    const avgScore = results.length > 0
        ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / results.length)
        : 100;

    return {
        dirPath: absolutePath,
        total: files.length,
        validCount,
        invalidCount,
        avgScore,
        results
    };
}

/**
 * Test whether a stream URL returns reachable media (200 OK / 206 Partial Content).
 * 
 * @param {string} streamUrl - Target video stream URL
 * @param {Object} [headers] - Stream headers (Referer, User-Agent, etc.)
 * @returns {Promise<Object>} Stream validation report
 */
async function validateStreamUrl(streamUrl, headers = {}) {
    if (!streamUrl || typeof streamUrl !== 'string') {
        return { playable: false, error: 'Invalid or missing stream URL' };
    }

    try {
        const fetchHeaders = {
            'User-Agent': headers['User-Agent'] || headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
            'Referer': headers['Referer'] || headers['referer'] || ''
        };

        // Try HEAD request first
        let res = await fetch(streamUrl, { method: 'HEAD', headers: fetchHeaders });

        // Fallback to GET range request if HEAD is restricted
        if (res.status === 405 || res.status === 403 || res.status === 400) {
            fetchHeaders['Range'] = 'bytes=0-1024';
            res = await fetch(streamUrl, { method: 'GET', headers: fetchHeaders });
        }

        const contentType = res.headers.get('content-type') || '';
        const isMedia = (res.ok || res.status === 206) && (contentType.includes('video') || contentType.includes('mpeg') || contentType.includes('stream') || contentType.includes('octet-stream') || res.status === 200);

        return {
            playable: isMedia,
            statusCode: res.status,
            contentType,
            url: streamUrl
        };
    } catch (e) {
        return {
            playable: false,
            error: e.message,
            url: streamUrl
        };
    }
}

module.exports = {
    validateExtension,
    validateDirectory,
    validateStreamUrl
};
