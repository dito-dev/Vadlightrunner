/**
 * VadLightrunner Persistent Database
 * 
 * SQLite-backed storage for:
 *   - Per-extension SharedPreferences (persist across restarts)
 *   - Watch history (track episode progress)
 *   - Favorites / library (saved anime)
 *   - Extension registry (installed extensions metadata)
 * 
 * Uses better-sqlite3 for synchronous, zero-dependency SQLite access.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file location — stored alongside the server
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'vadlightrunner.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL'); // Better concurrent read performance
        db.pragma('foreign_keys = ON');
        initSchema();
    }
    return db;
}

function initSchema() {
    const d = getDb();

    d.exec(`
        -- Per-extension preferences (replaces in-memory SharedPreferences)
        CREATE TABLE IF NOT EXISTS preferences (
            extension_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (extension_id, key)
        );

        -- Watch history for anime episodes
        CREATE TABLE IF NOT EXISTS watch_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            extension_id TEXT NOT NULL,
            extension_name TEXT DEFAULT '',
            anime_url TEXT NOT NULL,
            anime_name TEXT DEFAULT '',
            anime_image TEXT DEFAULT '',
            episode_url TEXT NOT NULL,
            episode_name TEXT DEFAULT '',
            episode_number REAL DEFAULT 0,
            progress REAL DEFAULT 0,
            duration REAL DEFAULT 0,
            watched_at TEXT DEFAULT (datetime('now')),
            UNIQUE(extension_id, episode_url)
        );

        -- Favorites / library
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            extension_id TEXT NOT NULL,
            extension_name TEXT DEFAULT '',
            anime_url TEXT NOT NULL,
            anime_name TEXT DEFAULT '',
            anime_image TEXT DEFAULT '',
            added_at TEXT DEFAULT (datetime('now')),
            UNIQUE(extension_id, anime_url)
        );

        -- Extension Repositories
        CREATE TABLE IF NOT EXISTS repositories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE NOT NULL,
            name TEXT DEFAULT '',
            extension_count INTEGER DEFAULT 0,
            last_synced TEXT DEFAULT (datetime('now')),
            added_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS repository_extensions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_url TEXT NOT NULL,
            extension_id TEXT NOT NULL,
            extension_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            version TEXT DEFAULT '1.0.0',
            lang TEXT DEFAULT 'en',
            is_nsfw INTEGER DEFAULT 0,
            item_type INTEGER DEFAULT 1,
            base_url TEXT DEFAULT '',
            icon_url TEXT DEFAULT '',
            added_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(repo_url) REFERENCES repositories(url) ON DELETE CASCADE,
            UNIQUE(repo_url, extension_id)
        );

        -- Index for fast lookups
        CREATE INDEX IF NOT EXISTS idx_prefs_ext ON preferences(extension_id);
        CREATE INDEX IF NOT EXISTS idx_history_ext ON watch_history(extension_id);
        CREATE INDEX IF NOT EXISTS idx_history_anime ON watch_history(anime_url);
        CREATE INDEX IF NOT EXISTS idx_favorites_ext ON favorites(extension_id);
        CREATE INDEX IF NOT EXISTS idx_repo_ext_url ON repository_extensions(repo_url);
    `);
}

// ──────────────────────────────────────────────
//  SharedPreferences (per-extension persistent)
// ──────────────────────────────────────────────

class PersistentSharedPreferences {
    constructor(extensionId, overrides = {}, defaults = {}, fallbackBaseUrl = '') {
        this.extensionId = extensionId;
        this.overrides = overrides;
        this.defaults = defaults;
        this.fallbackBaseUrl = fallbackBaseUrl;
        this._getStmt = getDb().prepare(
            'SELECT value FROM preferences WHERE extension_id = ? AND key = ?'
        );
        this._setStmt = getDb().prepare(`
            INSERT INTO preferences (extension_id, key, value)
            VALUES (?, ?, ?)
            ON CONFLICT(extension_id, key) DO UPDATE SET value = excluded.value
        `);
    }

    get(key) {
        // Query-time overrides take priority (for testing via API params)
        if (this.overrides[key] !== undefined) {
            return this.overrides[key];
        }
        const row = this._getStmt.get(this.extensionId, key);
        if (row) {
            try {
                return JSON.parse(row.value);
            } catch {
                return row.value;
            }
        }
        // Fallback to extension default preference values
        if (this.defaults[key] !== undefined) {
            return this.defaults[key];
        }
        // Fallback to extension metadata baseUrl
        if ((key.includes('base_url') || key.includes('baseUrl')) && this.fallbackBaseUrl) {
            return this.fallbackBaseUrl;
        }
        return undefined;
    }

    set(key, value) {
        const serialized = (typeof value === 'object' && value !== null)
            ? JSON.stringify(value)
            : String(value);
        this._setStmt.run(this.extensionId, key, serialized);
    }
}

// ──────────────────────────────────────────────
//  Watch History
// ──────────────────────────────────────────────

const watchHistory = {
    /**
     * Record or update watch progress for an episode.
     */
    upsert(entry) {
        const d = getDb();
        d.prepare(`
            INSERT INTO watch_history (extension_id, extension_name, anime_url, anime_name, anime_image, episode_url, episode_name, episode_number, progress, duration, watched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(extension_id, episode_url)
            DO UPDATE SET progress = excluded.progress, duration = excluded.duration, watched_at = excluded.watched_at,
                          anime_name = excluded.anime_name, anime_image = excluded.anime_image, episode_name = excluded.episode_name
        `).run(
            entry.extensionId || '', entry.extensionName || '',
            entry.animeUrl || '', entry.animeName || '', entry.animeImage || '',
            entry.episodeUrl || '', entry.episodeName || '', entry.episodeNumber || 0,
            entry.progress || 0, entry.duration || 0
        );
    },

    /**
     * Get recent watch history, optionally filtered by extension.
     */
    getRecent(limit = 50, extensionId = null) {
        const d = getDb();
        if (extensionId) {
            return d.prepare(
                'SELECT * FROM watch_history WHERE extension_id = ? ORDER BY watched_at DESC LIMIT ?'
            ).all(extensionId, limit);
        }
        return d.prepare(
            'SELECT * FROM watch_history ORDER BY watched_at DESC LIMIT ?'
        ).all(limit);
    },

    /**
     * Get watch progress for a specific episode.
     */
    getProgress(extensionId, episodeUrl) {
        const d = getDb();
        return d.prepare(
            'SELECT progress, duration FROM watch_history WHERE extension_id = ? AND episode_url = ?'
        ).get(extensionId, episodeUrl) || { progress: 0, duration: 0 };
    },

    /**
     * Get all watched episodes for a specific anime.
     */
    getForAnime(extensionId, animeUrl) {
        const d = getDb();
        return d.prepare(
            'SELECT * FROM watch_history WHERE extension_id = ? AND anime_url = ? ORDER BY episode_number ASC'
        ).all(extensionId, animeUrl);
    },

    /**
     * Delete a specific history entry.
     */
    delete(id) {
        const d = getDb();
        d.prepare('DELETE FROM watch_history WHERE id = ?').run(id);
    },

    /**
     * Clear all history.
     */
    clearAll() {
        const d = getDb();
        d.prepare('DELETE FROM watch_history').run();
    }
};

// ──────────────────────────────────────────────
//  Favorites / Library
// ──────────────────────────────────────────────

const favorites = {
    /**
     * Add an anime to favorites.
     */
    add(entry) {
        const d = getDb();
        d.prepare(`
            INSERT OR IGNORE INTO favorites (extension_id, extension_name, anime_url, anime_name, anime_image, added_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(
            entry.extensionId || '', entry.extensionName || '',
            entry.animeUrl || '', entry.animeName || '', entry.animeImage || ''
        );
    },

    /**
     * Remove an anime from favorites.
     */
    remove(extensionId, animeUrl) {
        const d = getDb();
        d.prepare('DELETE FROM favorites WHERE extension_id = ? AND anime_url = ?')
            .run(extensionId, animeUrl);
    },

    /**
     * Check if an anime is in favorites.
     */
    isFavorite(extensionId, animeUrl) {
        const d = getDb();
        const row = d.prepare(
            'SELECT id FROM favorites WHERE extension_id = ? AND anime_url = ?'
        ).get(extensionId, animeUrl);
        return !!row;
    },

    /**
     * Get all favorites, optionally filtered by extension.
     */
    getAll(extensionId = null) {
        const d = getDb();
        if (extensionId) {
            return d.prepare(
                'SELECT * FROM favorites WHERE extension_id = ? ORDER BY added_at DESC'
            ).all(extensionId);
        }
        return d.prepare('SELECT * FROM favorites ORDER BY added_at DESC').all();
    },

    /**
     * Delete a favorite by ID.
     */
    delete(id) {
        const d = getDb();
        d.prepare('DELETE FROM favorites WHERE id = ?').run(id);
    }
};

// ──────────────────────────────────────────────
//  Preferences direct access (for admin/debugging)
// ──────────────────────────────────────────────

const preferencesDb = {
    /**
     * Get all preferences for an extension.
     */
    getAllForExtension(extensionId) {
        const d = getDb();
        return d.prepare(
            'SELECT key, value FROM preferences WHERE extension_id = ?'
        ).all(extensionId);
    },

    /**
     * Delete all preferences for an extension.
     */
    clearForExtension(extensionId) {
        const d = getDb();
        d.prepare('DELETE FROM preferences WHERE extension_id = ?').run(extensionId);
    }
};

const repositoryDb = {
    addRepo(url, name = '', extensionCount = 0) {
        const d = getDb();
        d.prepare(`
            INSERT INTO repositories (url, name, extension_count, last_synced, added_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(url) DO UPDATE SET name = excluded.name, extension_count = excluded.extension_count, last_synced = datetime('now')
        `).run(url, name, extensionCount);
    },

    saveExtension(entry) {
        const d = getDb();
        d.prepare(`
            INSERT OR IGNORE INTO repositories (url, name, extension_count, last_synced, added_at)
            VALUES (?, 'Repository', 1, datetime('now'), datetime('now'))
        `).run(entry.repoUrl);

        d.prepare(`
            INSERT INTO repository_extensions (repo_url, extension_id, extension_name, file_path, version, lang, is_nsfw, item_type, base_url, icon_url, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(repo_url, extension_id) DO UPDATE SET
                extension_name = excluded.extension_name,
                file_path = excluded.file_path,
                version = excluded.version,
                lang = excluded.lang,
                is_nsfw = excluded.is_nsfw,
                item_type = excluded.item_type,
                base_url = excluded.base_url,
                icon_url = excluded.icon_url,
                added_at = datetime('now')
        `).run(
            entry.repoUrl, entry.extensionId, entry.extensionName, entry.filePath,
            entry.version || '1.0.0', entry.lang || 'en', entry.isNsfw ? 1 : 0,
            entry.itemType || 1, entry.baseUrl || '', entry.iconUrl || ''
        );
    },

    getAllRepos() {
        const d = getDb();
        const repos = d.prepare('SELECT * FROM repositories ORDER BY added_at DESC').all();
        return repos.map(r => {
            const exts = d.prepare('SELECT * FROM repository_extensions WHERE repo_url = ?').all(r.url);
            return { ...r, extensions: exts };
        });
    },

    removeRepo(url) {
        const d = getDb();
        const exts = d.prepare('SELECT file_path FROM repository_extensions WHERE repo_url = ?').all(url);
        d.prepare('DELETE FROM repository_extensions WHERE repo_url = ?').run(url);
        d.prepare('DELETE FROM repositories WHERE url = ?').run(url);
        return exts.map(e => e.file_path);
    }
};

/**
 * Close the database connection (for graceful shutdown).
 */
function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = {
    getDb,
    PersistentSharedPreferences,
    watchHistory,
    favorites,
    preferencesDb,
    repositoryDb,
    closeDb
};
