/**
 * File Watcher for Extension Hot-Reload
 * 
 * Uses chokidar to watch extension directories for changes.
 * When an extension .js file is added, changed, or removed,
 * the watcher triggers a cache invalidation and re-scan.
 */

const chokidar = require('chokidar');
const path = require('path');

class ExtensionWatcher {
    /**
     * @param {Object} directories - Map of group name -> directory path
     * @param {Function} onReload - Callback when extensions need reloading. Receives (event, filePath, group).
     * @param {Object} options - Watcher options
     */
    constructor(directories, onReload, options = {}) {
        this.directories = directories;
        this.onReload = onReload;
        this.debounceMs = options.debounceMs || 500;
        this.watchers = [];
        this._debounceTimers = new Map();
    }

    /**
     * Start watching all extension directories.
     */
    start() {
        for (const [group, dirPath] of Object.entries(this.directories)) {
            try {
                const watcher = chokidar.watch(path.join(dirPath, '*.js'), {
                    persistent: true,
                    ignoreInitial: true,
                    awaitWriteFinish: {
                        stabilityThreshold: 300,
                        pollInterval: 100
                    }
                });

                watcher
                    .on('add', (filePath) => this._handleEvent('add', filePath, group))
                    .on('change', (filePath) => this._handleEvent('change', filePath, group))
                    .on('unlink', (filePath) => this._handleEvent('unlink', filePath, group))
                    .on('error', (error) => {
                        console.error(`[Watcher][${group}] Error:`, error.message);
                    });

                this.watchers.push(watcher);
                console.log(`[Watcher] Watching extension directory: [${group}] ${dirPath}`);
            } catch (e) {
                console.warn(`[Watcher] Could not watch '${group}' (${dirPath}):`, e.message);
            }
        }
    }

    /**
     * Debounced event handler to avoid rapid-fire reloads during saves.
     */
    _handleEvent(event, filePath, group) {
        const key = `${group}:${filePath}`;
        const fileName = path.basename(filePath);

        // Clear existing debounce timer for this file
        if (this._debounceTimers.has(key)) {
            clearTimeout(this._debounceTimers.get(key));
        }

        this._debounceTimers.set(key, setTimeout(() => {
            this._debounceTimers.delete(key);

            const eventLabel = event === 'add' ? '➕ Added' :
                               event === 'change' ? '🔄 Changed' :
                               event === 'unlink' ? '🗑️ Removed' : event;

            console.log(`[Watcher] ${eventLabel}: [${group}] ${fileName}`);

            if (this.onReload) {
                try {
                    this.onReload(event, filePath, group);
                } catch (e) {
                    console.error(`[Watcher] Reload callback error:`, e.message);
                }
            }
        }, this.debounceMs));
    }

    /**
     * Stop all watchers.
     */
    async stop() {
        for (const watcher of this.watchers) {
            await watcher.close();
        }
        this.watchers = [];
        for (const timer of this._debounceTimers.values()) {
            clearTimeout(timer);
        }
        this._debounceTimers.clear();
        console.log('[Watcher] All watchers stopped.');
    }
}

module.exports = { ExtensionWatcher };
