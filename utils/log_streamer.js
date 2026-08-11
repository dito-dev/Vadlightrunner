/**
 * WebSocket Live Log Streaming
 * 
 * Provides real-time log streaming from extension execution to connected
 * WebSocket clients. Supports multiple channels and log levels.
 * 
 * Usage:
 *   const { LogStreamer } = require('./utils/log_streamer');
 *   const streamer = new LogStreamer(httpServer);
 *   streamer.broadcast('info', 'Extension loaded');
 *   // In extension logCallback: streamer.sendLog(source, level, message);
 */

const WebSocket = require('ws');

class LogStreamer {
    /**
     * @param {http.Server} server - HTTP server to attach WebSocket to
     * @param {Object} options
     * @param {string} options.path - WebSocket endpoint path (default: '/ws/logs')
     * @param {number} options.maxHistory - Max log entries to keep in memory ring buffer (default: 500)
     */
    constructor(server, options = {}) {
        this.path = options.path || '/ws/logs';
        this.maxHistory = options.maxHistory || 500;
        this.history = [];
        this.clients = new Set();

        this.wss = new WebSocket.Server({
            server,
            path: this.path
        });

        this.wss.on('connection', (ws, req) => {
            this.clients.add(ws);
            console.log(`[LogStreamer] Client connected (${this.clients.size} total)`);

            // Send recent history to newly connected client
            ws.send(JSON.stringify({
                type: 'history',
                logs: this.history
            }));

            // Listen for log messages from connected clients
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === 'log') {
                        this.sendLog(
                            data.source || 'Client',
                            data.level || 'info',
                            data.message || '',
                            data.meta || {}
                        );
                    }
                } catch (e) {
                    console.error('[LogStreamer] WebSocket message parse error:', e.message);
                }
            });

            ws.on('close', () => {
                this.clients.delete(ws);
                console.log(`[LogStreamer] Client disconnected (${this.clients.size} total)`);
            });

            ws.on('error', (err) => {
                console.error('[LogStreamer] WebSocket error:', err.message);
                this.clients.delete(ws);
            });
        });

        console.log(`[LogStreamer] WebSocket log streaming available at ws://localhost:PORT${this.path}`);
    }

    /**
     * Create a log entry and broadcast to all connected clients.
     * @param {string} source - Extension name or system identifier
     * @param {string} level - Log level: 'info', 'warn', 'error', 'debug'
     * @param {string} message - Log message
     * @param {Object} meta - Optional metadata (executionTimeMs, action, etc.)
     */
    sendLog(source, level, message, meta = {}) {
        const entry = {
            type: 'log',
            timestamp: new Date().toISOString(),
            source,
            level,
            message,
            ...meta
        };

        // Add to ring buffer
        this.history.push(entry);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        // Broadcast to all connected clients
        this._broadcast(entry);
    }

    /**
     * Send a health check event to all connected clients.
     * @param {Object} healthData - Health check results
     */
    sendHealthUpdate(healthData) {
        const entry = {
            type: 'health',
            timestamp: new Date().toISOString(),
            data: healthData
        };
        this._broadcast(entry);
    }

    /**
     * Send a hot-reload event to all connected clients.
     * @param {string} event - File system event (add, change, unlink)
     * @param {string} fileName - Affected file name
     * @param {string} group - Extension group
     */
    sendReloadEvent(event, fileName, group) {
        const entry = {
            type: 'reload',
            timestamp: new Date().toISOString(),
            event,
            fileName,
            group
        };

        this.history.push(entry);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        this._broadcast(entry);
    }

    /**
     * Create a logCallback function for use with loadExtension().
     * @param {string} source - Extension name
     * @returns {Function} logCallback(level, message)
     */
    createLogCallback(source) {
        return (level, message) => {
            this.sendLog(source, level, message);
        };
    }

    /**
     * Broadcast a message to all connected WebSocket clients.
     */
    _broadcast(data) {
        const json = JSON.stringify(data);
        for (const ws of this.clients) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(json);
            }
        }
    }

    /**
     * Get connection stats.
     */
    getStats() {
        return {
            connectedClients: this.clients.size,
            historySize: this.history.length,
            path: this.path
        };
    }
}

module.exports = { LogStreamer };
