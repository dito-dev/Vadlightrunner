const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cheerio = require('cheerio');

const { initStringExtensions, substringAfter, substringAfterLast, substringBefore, substringBeforeLast, substringBetween } = require('./utils/string_utils');
const { CryptoJS, unpackJs, unpackJsAndCombine, deobfuscateJsPassword, encryptAESCryptoJS, decryptAESCryptoJS, decryptAESGCM, cryptoHandler } = require('./utils/crypto_utils');
const { HttpClient } = require('./utils/http_client');
const { parseM3U8Qualities, extractDirectVideoUrls, extractJWPlayerSources, extractFromPackedScript } = require('./utils/video_extractors');
const { PersistentSharedPreferences } = require('./utils/database');

// Initialize String prototype extensions (substringAfter, etc.)
initStringExtensions();

// --- Compiled vm.Script Cache ---
const scriptCache = new Map();

function getCompiledScript(filePath) {
    const stat = fs.statSync(filePath);
    const cached = scriptCache.get(filePath);

    if (cached && cached.mtime === stat.mtimeMs) {
        return cached.script;
    }

    let code = fs.readFileSync(filePath, 'utf8');
    // Strip ES module imports/exports if present
    code = code.replace(/^\s*import\s+[^;\n]+;/gm, '// $&')
               .replace(/^\s*export\s+{[^}]*};?/gm, '// $&')
               .replace(/^\s*export\s+default\s+/gm, '');
    const script = new vm.Script(code, { filename: filePath });
    scriptCache.set(filePath, { script, mtime: stat.mtimeMs });
    return script;
}

/**
 * Invalidate a specific file from the script cache.
 */
function invalidateScriptCache(filePath) {
    scriptCache.delete(filePath);
}

// --- Cheerio wrappers to emulate Mangayomi's Document and Element APIs ---
class Element {
    constructor($el, $) {
        this.$el = $el || null;
        this.$ = $ || null;
    }

    get exists() {
        return !!(this.$el && this.$el.length > 0);
    }

    // --- Text ---
    get text() {
        return (this.exists ? this.$el.text() : '') || '';
    }

    // --- HTML ---
    get html() {
        return (this.exists ? (this.$el.prop('outerHTML') || this.$.html(this.$el)) : '') || '';
    }

    get outerHtml() {
        return this.html;
    }

    get innerHTML() {
        return (this.exists ? this.$el.html() : '') || '';
    }

    // --- Attributes ---
    get className() {
        return (this.exists ? this.$el.attr('class') : '') || '';
    }

    get id() {
        return (this.exists ? this.$el.attr('id') : '') || '';
    }

    get tagName() {
        if (!this.exists) return '';
        const name = this.$el.prop('tagName') || this.$el.get(0)?.tagName || this.$el.get(0)?.name || '';
        return String(name).toLowerCase();
    }

    get src() {
        return (this.exists ? (this.$el.attr('src') || this.$el.attr('data-src') || this.$el.attr('data-original') || this.$el.attr('data-lazy-src') || this.$el.attr('srcset')) : '') || '';
    }

    get getSrc() {
        return this.src;
    }

    get href() {
        return (this.exists ? this.$el.attr('href') : '') || '';
    }

    get getHref() {
        return this.href;
    }

    get value() {
        return (this.exists ? (this.$el.val() || this.$el.attr('value')) : '') || '';
    }

    attr(name) {
        return this.exists ? this.$el.attr(name) : undefined;
    }

    hasAttr(name) {
        return this.exists ? this.$el.attr(name) !== undefined : false;
    }

    // --- Traversal ---
    get parent() {
        if (!this.exists) return new Element(null, this.$);
        const parent = this.$el.parent();
        return new Element(parent.length > 0 ? parent : null, this.$);
    }

    get nextSibling() {
        if (!this.exists) return new Element(null, this.$);
        const next = this.$el.next();
        return new Element(next.length > 0 ? next : null, this.$);
    }

    get previousSibling() {
        if (!this.exists) return new Element(null, this.$);
        const prev = this.$el.prev();
        return new Element(prev.length > 0 ? prev : null, this.$);
    }

    get firstChild() {
        if (!this.exists) return new Element(null, this.$);
        const first = this.$el.children().first();
        return new Element(first.length > 0 ? first : null, this.$);
    }

    get lastChild() {
        if (!this.exists) return new Element(null, this.$);
        const last = this.$el.children().last();
        return new Element(last.length > 0 ? last : null, this.$);
    }

    get children() {
        if (!this.exists) return [];
        const list = [];
        this.$el.children().each((_, el) => {
            list.push(new Element(this.$(el), this.$));
        });
        return list;
    }

    // --- Selection ---
    selectFirst(selector) {
        if (!this.exists) return new Element(null, this.$);
        const found = this.$el.find(selector).first();
        return new Element(found.length > 0 ? found : null, this.$);
    }

    select(selector) {
        if (!this.exists) return [];
        const list = [];
        this.$el.find(selector).each((i, el) => {
            list.push(new Element(this.$(el), this.$));
        });
        return list;
    }

    remove() {
        if (this.exists) this.$el.remove();
    }

    get length() {
        return this.exists ? this.$el.length : 0;
    }
}

class Document {
    constructor(html) {
        this.$ = cheerio.load(html || '');
    }

    get html() {
        return this.$.html() || '';
    }

    get outerHtml() {
        return this.html;
    }

    get innerHTML() {
        return this.$('body').html() || this.$.html() || '';
    }

    get body() {
        const found = this.$('body');
        return new Element(found.length > 0 ? found : null, this.$);
    }

    get head() {
        const found = this.$('head');
        return new Element(found.length > 0 ? found : null, this.$);
    }

    selectFirst(selector) {
        const found = this.$(selector).first();
        return new Element(found.length > 0 ? found : null, this.$);
    }

    select(selector) {
        const list = [];
        this.$(selector).each((i, el) => {
            list.push(new Element(this.$(el), this.$));
        });
        return list;
    }
}

// --- Native Fetch Client (replaces axios) ---
// The Client class wraps HttpClient for backwards-compatible Mangayomi API.
// Uses Node.js native fetch (undici) under the hood.
class Client {
    constructor() {
        this._http = new HttpClient();
    }

    async get(url, headers = {}) {
        return this._http.get(url, headers);
    }

    async post(url, headers = {}, body = '') {
        return this._http.post(url, headers, body);
    }

    async put(url, headers = {}, body = '') {
        return this._http.put(url, headers, body);
    }

    async delete(url, headers = {}, body = '') {
        return this._http.delete(url, headers, body);
    }

    async patch(url, headers = {}, body = '') {
        return this._http.patch(url, headers, body);
    }

    async head(url, headers = {}) {
        return this._http.head(url, headers);
    }
}

// --- Mock SharedPreferences ---
class SharedPreferences {
    constructor(initialStore = {}) {
        this.store = { ...initialStore };
    }

    get(key) {
        return this.store[key] || null;
    }

    set(key, value) {
        this.store[key] = value;
    }
}

/**
 * MProvider base class — matches Mangayomi's MProvider injected via service.dart.
 * 
 * In Mangayomi, the runtime evaluates a class definition for MProvider that includes
 * a `source` getter returning the serialized source metadata JSON. Extensions extend
 * this class, so `this.source.baseUrl`, `this.source.apiUrl`, etc. all work.
 * 
 * The `source` property is injected dynamically in loadExtension() after parsing
 * mangayomiSources from the extension file.
 */
class MProvider {
    // `source` is set on the prototype by loadExtension() — see below.
    // This mirrors Mangayomi's `get source() { return <sourceJson>; }`

    get supportsLatest() {
        return true;
    }

    getHeaders(url) {
        return {};
    }

    getSourcePreferences() {
        return [];
    }
}

/**
 * Loads and initializes a Mangayomi JS extension file inside a VM sandbox.
 * @param {string} filePath - Absolute path to the extension JS file.
 * @param {Object} preferences - Query-defined user preferences for SharedPreferences.
 * @param {Function} logCallback - Custom logger callback for output interception.
 * @returns {Object} Instantiated extension instance and metadata.
 */
function loadExtension(filePath, preferences = {}, logCallback) {
    const script = getCompiledScript(filePath);

    const extId = path.basename(filePath, '.js');

    const prefDefaults = {};
    let sharedBaseUrl = '';

    // Create the sandboxed context with all required classes and globals
    const sandbox = {
        // Shield Node primitives to prevent sandbox escape while preserving JS eval/Function for packed scrapers
        process: undefined,
        require: undefined,
        global: undefined,
        globalThis: undefined,
        module: undefined,
        exports: undefined,
        __dirname: undefined,
        __filename: undefined,
        eval: eval,
        Function: Function,

        MProvider,
        Client,
        Document,
        Element,
        SharedPreferences: function() {
            return new PersistentSharedPreferences(extId, preferences, prefDefaults, sharedBaseUrl);
        },
        console: {
            log: (...args) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                if (logCallback) logCallback('info', msg);
                if (global._logStreamer) {
                    global._logStreamer.sendLog(path.basename(filePath, '.js'), 'info', msg);
                }
                console.log(`[ExtLog][${path.basename(filePath)}]`, ...args);
            },
            error: (...args) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                if (logCallback) logCallback('error', msg);
                if (global._logStreamer) {
                    global._logStreamer.sendLog(path.basename(filePath, '.js'), 'error', msg);
                }
                console.error(`[ExtErr][${path.basename(filePath)}]`, ...args);
            },
            warn: (...args) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                if (logCallback) logCallback('warn', msg);
                if (global._logStreamer) {
                    global._logStreamer.sendLog(path.basename(filePath, '.js'), 'warn', msg);
                }
                console.warn(`[ExtWarn][${path.basename(filePath)}]`, ...args);
            },
            info: (...args) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                if (logCallback) logCallback('info', msg);
                if (global._logStreamer) {
                    global._logStreamer.sendLog(path.basename(filePath, '.js'), 'info', msg);
                }
                console.info(`[ExtInfo][${path.basename(filePath)}]`, ...args);
            }
        },
        // Crypto & Unpacker utilities
        CryptoJS,
        unpackJs,
        unpackJsAndCombine,
        deobfuscateJsPassword,
        encryptAESCryptoJS,
        decryptAESCryptoJS,
        decryptAESGCM,
        cryptoHandler,

        // Video extractor helpers
        parseM3U8Qualities,
        extractDirectVideoUrls,
        extractJWPlayerSources,
        extractFromPackedScript,
                streamWishExtractor: async function(...args) { return []; },
        filemoonExtractor: async function(...args) { return []; },
        doodExtractor: async function(...args) { return []; },
        streamTapeExtractor: async function(...args) { return []; },
        vidhideExtractor: async function(...args) { return []; },
        vidHideExtractor: async function(...args) { return []; },
        mystreamExtractor: async function(...args) { return []; },
        sibnetExtractor: async function(...args) { return []; },
        mp4UploadExtractor: async function(...args) { return []; },
        voeExtractor: async function(...args) { return []; },
        mixdropExtractor: async function(...args) { return []; },
        streamLareExtractor: async function(...args) { return []; },
        streamlareExtractor: async function(...args) { return []; },
        lulustreamExtractor: async function(...args) { return []; },
        streamiumExtractor: async function(...args) { return []; },
        yourUploadExtractor: async function(...args) { return []; },
        sendVidExtractor: async function(...args) { return []; },
        quarkFilesExtractor: async function(...args) { return []; },
        ucFilesExtractor: async function(...args) { return []; },
        quarkVideosExtractor: async function(...args) { return []; },
        ucVideosExtractor: async function(...args) { return []; },
        vidGuardExtractor: async function(...args) { return []; },
        vidozaExtractor: async function(...args) { return []; },
        okruExtractor: async function(...args) { return []; },
        amazonExtractor: async function(...args) { return []; },
        speedfilesExtractor: async function(...args) { return []; },
        luluvdoExtractor: async function(...args) { return []; },
        burstcloudExtractor: async function(...args) { return []; },
        m3u8Extractor: async function(...args) { return []; },
        jwplayerExtractor: async function(...args) { return []; },
        _streamWishExtractor: async function(...args) { return []; },
        _voeExtractor: async function(...args) { return []; },
        _mp4UploadExtractor: async function(...args) { return []; },
        _yourUploadExtractor: async function(...args) { return []; },
        _sendVidExtractor: async function(...args) { return []; },
        vidmolyExtractor: async function(...args) { return []; },
        AllAnimeExtractor: async function(...args) { return []; },
        gogoCdnExtractor: async function(...args) { return []; },

        // String utilities
        substringAfter,
        substringAfterLast,
        substringBefore,
        substringBeforeLast,
        substringBetween,

        // Base64 helper globals (Node globals + atob/btoa fallback)
        atob: (str) => Buffer.from(str, 'base64').toString('binary'),
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        Buffer,
        URL,
        URLSearchParams,
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        encodeURI,
        decodeURI,
        RegExp,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Map,
        Set,
        Date,
        Math,
        Promise,
        Error,
        TypeError,
        RangeError,
        SyntaxError,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    };

    const context = vm.createContext(sandbox);

    // Run the compiled extension script with 30s timeout safety
    script.runInContext(context, { timeout: 30000 });

    // Retrieve DefaultExtension and mangayomiSources
    let DefaultExtension;
    try {
        DefaultExtension = vm.runInContext('DefaultExtension', context);
    } catch (e) {
        // ignore
    }

    if (!DefaultExtension) {
        throw new Error(`Extension in ${filePath} does not define 'DefaultExtension' class`);
    }

    let metadata = [];
    try {
        metadata = vm.runInContext('mangayomiSources', context);
    } catch (e) {
        // ignore
    }

    // --- Mangayomi Parity: Inject source metadata into MProvider ---
    // Mangayomi's service.dart does: `runtime.evaluate('class MProvider { get source() { return <sourceJson>; } ... }')`
    // This makes `this.source.baseUrl`, `this.source.apiUrl`, etc. available to extensions.
    // We inject it onto DefaultExtension.prototype so all instances inherit it.
    const sourceMeta = (metadata && metadata.length > 0) ? metadata[0] : {};
    const sourceObj = {
        name: sourceMeta.name || '',
        baseUrl: sourceMeta.baseUrl || '',
        apiUrl: sourceMeta.apiUrl || '',
        lang: sourceMeta.lang || 'en',
        id: sourceMeta.id || 0,
        isManga: sourceMeta.isManga !== undefined ? sourceMeta.isManga : false,
        isNsfw: sourceMeta.isNsfw || false,
        iconUrl: sourceMeta.iconUrl || '',
        version: sourceMeta.version || '1.0.0',
        dateFormat: sourceMeta.dateFormat || '',
        dateFormatLocale: sourceMeta.dateFormatLocale || '',
        typeSource: sourceMeta.typeSource || 'single',
        itemType: sourceMeta.itemType || 1,
        hasCloudflare: sourceMeta.hasCloudflare || false,
        isFullData: sourceMeta.isFullData || false,
        appMinVerReq: sourceMeta.appMinVerReq || '0.3.0',
        sourceCodeLanguage: sourceMeta.sourceCodeLanguage || 1,
        additionalParams: sourceMeta.additionalParams || '',
    };

    // Set on prototype so `this.source` works in any method
    if (!DefaultExtension.prototype.hasOwnProperty('source')) {
        Object.defineProperty(DefaultExtension.prototype, 'source', {
            get: function() { return sourceObj; },
            configurable: true
        });
    }

    sharedBaseUrl = sourceObj.baseUrl;

    const instance = new DefaultExtension();

    if (typeof instance.getSourcePreferences === 'function') {
        try {
            const prefs = instance.getSourcePreferences() || [];
            for (const item of prefs) {
                if (!item || !item.key) continue;
                if (item.editTextPreference && item.editTextPreference.value !== undefined) {
                    prefDefaults[item.key] = item.editTextPreference.value;
                } else if (item.listPreference) {
                    const idx = item.listPreference.valueIndex || 0;
                    const vals = item.listPreference.entryValues || [];
                    if (vals[idx] !== undefined) prefDefaults[item.key] = vals[idx];
                } else if (item.switchPreferenceCompat && item.switchPreferenceCompat.value !== undefined) {
                    prefDefaults[item.key] = item.switchPreferenceCompat.value;
                } else if (item.multiSelectListPreference && item.multiSelectListPreference.values !== undefined) {
                    prefDefaults[item.key] = item.multiSelectListPreference.values;
                }
            }
        } catch (e) {
            // ignore
        }
    }

    return {
        instance,
        metadata
    };
}

module.exports = {
    loadExtension,
    scriptCache,
    invalidateScriptCache
};
