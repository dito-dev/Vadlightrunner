/**
 * LightRunner HTTP Client
 * 
 * Replaces axios with Node.js native fetch (backed by undici in Node 18+).
 * Features:
 *   - Connection pooling via undici's built-in pool
 *   - Per-domain rate limiting (configurable tokens/sec)
 *   - Automatic retry with exponential backoff
 *   - Request/response logging hooks
 */

// --- Per-domain rate limiter ---
class RateLimiter {
    constructor(maxRequestsPerSecond = 5) {
        this.maxRPS = maxRequestsPerSecond;
        this.domainTimestamps = new Map(); // domain -> [timestamp, ...]
    }

    /**
     * Wait if needed to satisfy rate limit for the given domain.
     */
    async throttle(domain) {
        const now = Date.now();
        if (!this.domainTimestamps.has(domain)) {
            this.domainTimestamps.set(domain, []);
        }

        const timestamps = this.domainTimestamps.get(domain);

        // Purge timestamps older than 1 second
        while (timestamps.length > 0 && timestamps[0] < now - 1000) {
            timestamps.shift();
        }

        if (timestamps.length >= this.maxRPS) {
            const waitMs = timestamps[0] + 1000 - now;
            if (waitMs > 0) {
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
            // Purge again after waiting
            const nowAfter = Date.now();
            while (timestamps.length > 0 && timestamps[0] < nowAfter - 1000) {
                timestamps.shift();
            }
        }

        timestamps.push(Date.now());
    }

    /**
     * Extract domain from URL string.
     */
    static getDomain(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return 'unknown';
        }
    }
}

const globalRateLimiter = new RateLimiter(8); // 8 requests/sec per domain default

const { globalResponseCache } = require('./response_cache');

/**
 * HTTP Client using native fetch with rate limiting, retry, and response caching.
 * Drop-in replacement for the Mangayomi Client class.
 */
class HttpClient {
    constructor(options = {}) {
        this.rateLimiter = options.rateLimiter || globalRateLimiter;
        this.cache = options.cache || globalResponseCache;
        this.useCache = options.useCache !== undefined ? options.useCache : true;
        this.maxRetries = options.maxRetries || 2;
        this.retryDelayMs = options.retryDelayMs || 500;
    }

    /**
     * Core request method using native fetch.
     */
    async _request(method, url, headers = {}, body = null, options = {}) {
        const cleanHeaders = {};
        for (const [k, v] of Object.entries(headers || {})) {
            if (v !== undefined && v !== null) {
                cleanHeaders[k] = String(v);
            }
        }

        // Check cache for GET requests if caching is enabled
        const cacheControl = (cleanHeaders['cache-control'] || cleanHeaders['Cache-Control'] || '').toLowerCase();
        const shouldCache = method === 'GET' && this.useCache && options.cache !== false && cacheControl !== 'no-cache' && cacheControl !== 'no-store';
        let cacheKey = null;

        const startTime = Date.now();

        if (shouldCache) {
            cacheKey = this.cache.generateKey(url, cleanHeaders);
            const cachedResponse = this.cache.get(cacheKey);
            if (cachedResponse) {
                if (global._logStreamer) {
                    global._logStreamer.sendLog('HttpClient', 'debug', `${method} ${url} -> 200 OK (CACHE HIT)`);
                }
                return cachedResponse;
            }
        }

        const domain = RateLimiter.getDomain(url);
        await this.rateLimiter.throttle(domain);

        const fetchOptions = {
            method,
            headers: cleanHeaders,
            redirect: 'follow'
        };

        if (body !== null && body !== undefined && method !== 'GET' && method !== 'HEAD') {
            if (typeof body === 'object' && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array)) {
                fetchOptions.body = JSON.stringify(body);
                if (!cleanHeaders['Content-Type'] && !cleanHeaders['content-type']) {
                    fetchOptions.headers['Content-Type'] = 'application/json';
                }
            } else {
                fetchOptions.body = body;
            }
        }

        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                let response = await fetch(url, fetchOptions);
                let responseBody = await response.text();

                // If Cloudflare 403 block is encountered, fallback to system curl in emulator
                if ((response.status === 403 || responseBody.includes("Cloudflare") || responseBody.includes("Attention Required!")) && method === 'GET') {
                    try {
                        const { execSync } = require('child_process');
                        let headerArgs = '';
                        for (const [hk, hv] of Object.entries(cleanHeaders)) {
                            headerArgs += ` -H "${hk}: ${String(hv).replace(/"/g, '\\"')}"`;
                        }
                        const curlCmd = `curl -s -L "${url}" ${headerArgs}`;
                        const curlOutput = execSync(curlCmd, { encoding: 'utf8', timeout: 15000 });
                        if (curlOutput && !curlOutput.includes("Attention Required!") && !curlOutput.includes("Cloudflare")) {
                            responseBody = curlOutput;
                            response = { status: 200, ok: true, headers: new Map([['content-type', 'text/html']]) };
                        }
                    } catch (curlErr) {
                        // Ignore curl error and proceed with original fetch response
                    }
                }

                // Convert headers to plain object
                const responseHeaders = {};
                if (typeof response.headers?.forEach === 'function') {
                    response.headers.forEach((value, key) => {
                        responseHeaders[key] = value;
                    });
                }

                const result = {
                    body: responseBody,
                    statusCode: response.status,
                    headers: responseHeaders
                };

                if (shouldCache && cacheKey && (response.ok || response.status === 200)) {
                    this.cache.set(cacheKey, result, options.ttlMs);
                }

                if (global._logStreamer) {
                    const elapsed = Date.now() - startTime;
                    global._logStreamer.sendLog('HttpClient', (response.ok || response.status === 200) ? 'info' : 'warn', `${method} ${url} -> ${response.status} (${elapsed}ms)`);
                }

                return result;
            } catch (error) {
                lastError = error;
                if (attempt < this.maxRetries) {
                    const delay = this.retryDelayMs * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        if (global._logStreamer) {
            global._logStreamer.sendLog('HttpClient', 'error', `${method} ${url} failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`);
        }
        console.error(`HttpClient.${method.toLowerCase()} failed for ${url} after ${this.maxRetries + 1} attempts:`, lastError?.message);
        throw lastError;
    }

    async get(url, headers = {}, options = {}) {
        return this._request('GET', url, headers, null, options);
    }

    async post(url, headers = {}, body = '', options = {}) {
        return this._request('POST', url, headers, body, options);
    }

    async put(url, headers = {}, body = '', options = {}) {
        return this._request('PUT', url, headers, body, options);
    }

    async delete(url, headers = {}, body = '', options = {}) {
        return this._request('DELETE', url, headers, body, options);
    }

    async patch(url, headers = {}, body = '', options = {}) {
        return this._request('PATCH', url, headers, body, options);
    }

    async head(url, headers = {}, options = {}) {
        return this._request('HEAD', url, headers, null, options);
    }
}

module.exports = {
    HttpClient,
    RateLimiter,
    globalRateLimiter
};

