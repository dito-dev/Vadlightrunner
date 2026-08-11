/**
 * LightRunner Response Cache
 * 
 * High-performance in-memory response cache with TTL, LRU eviction,
 * cache stats tracking, and manual invalidation.
 */

class ResponseCache {
    constructor(options = {}) {
        this.defaultTTLMs = options.defaultTTLMs || 5 * 60 * 1000; // 5 minutes default TTL
        this.maxSize = options.maxSize || 500; // Maximum number of items in cache
        this.cache = new Map(); // key -> { value, expiresAt, sizeBytes }

        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Generate a unique cache key from URL and relevant headers.
     */
    generateKey(url, headers = {}) {
        // Sort headers to ensure consistent cache key
        const headerKeys = Object.keys(headers || {}).sort();
        const headerPart = headerKeys.map(k => `${k.toLowerCase()}:${headers[k]}`).join(';');
        return `${url}|${headerPart}`;
    }

    /**
     * Retrieve a cached response if valid and not expired.
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return null;
        }

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }

        this.hits++;
        // Refresh entry position for LRU eviction order
        this.cache.delete(key);
        this.cache.set(key, entry);

        return entry.value;
    }

    /**
     * Store a value in the cache with a specified or default TTL.
     */
    set(key, value, ttlMs = this.defaultTTLMs) {
        if (!key || value === undefined || value === null) return;

        // LRU Eviction if full
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }

        const sizeBytes = typeof value === 'string' 
            ? Buffer.byteLength(value, 'utf8') 
            : Buffer.byteLength(JSON.stringify(value), 'utf8');

        const entry = {
            value,
            expiresAt: Date.now() + ttlMs,
            sizeBytes,
            createdAt: Date.now()
        };

        this.cache.set(key, entry);
    }

    /**
     * Clear all cached entries.
     */
    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Purge expired items from cache.
     */
    purgeExpired() {
        const now = Date.now();
        let purged = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                purged++;
            }
        }
        return purged;
    }

    /**
     * Retrieve cache statistics.
     */
    getStats() {
        const totalRequests = this.hits + this.misses;
        const hitRatio = totalRequests > 0 ? (this.hits / totalRequests) : 0;
        
        let totalSizeBytes = 0;
        for (const entry of this.cache.values()) {
            totalSizeBytes += entry.sizeBytes || 0;
        }

        return {
            itemCount: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            totalRequests,
            hitRatioPercentage: (hitRatio * 100).toFixed(1) + '%',
            totalSizeBytes,
            totalSizeFormatted: (totalSizeBytes / 1024).toFixed(1) + ' KB'
        };
    }
}

// Global default response cache instance
const globalResponseCache = new ResponseCache();

module.exports = {
    ResponseCache,
    globalResponseCache
};
