/**
 * String utility extensions matching Mangayomi / Kotlin String extension methods.
 */

function initStringExtensions() {
    if (!String.prototype.substringAfter) {
        String.prototype.substringAfter = function(pattern) {
            if (pattern === undefined || pattern === null) return this.toString();
            const idx = this.indexOf(pattern);
            return idx === -1 ? this.toString() : this.substring(idx + String(pattern).length);
        };
    }

    if (!String.prototype.substringAfterLast) {
        String.prototype.substringAfterLast = function(pattern) {
            if (pattern === undefined || pattern === null) return this.toString();
            const idx = this.lastIndexOf(pattern);
            return idx === -1 ? this.toString() : this.substring(idx + String(pattern).length);
        };
    }

    if (!String.prototype.substringBefore) {
        String.prototype.substringBefore = function(pattern) {
            if (pattern === undefined || pattern === null) return this.toString();
            const idx = this.indexOf(pattern);
            return idx === -1 ? this.toString() : this.substring(0, idx);
        };
    }

    if (!String.prototype.substringBeforeLast) {
        String.prototype.substringBeforeLast = function(pattern) {
            if (pattern === undefined || pattern === null) return this.toString();
            const idx = this.lastIndexOf(pattern);
            return idx === -1 ? this.toString() : this.substring(0, idx);
        };
    }

    if (!String.prototype.substringBetween) {
        String.prototype.substringBetween = function(left, right) {
            if (left === undefined || left === null || right === undefined || right === null) return '';
            const start = this.indexOf(left);
            if (start === -1) return '';
            const end = this.indexOf(right, start + String(left).length);
            if (end === -1) return '';
            return this.substring(start + String(left).length, end);
        };
    }
}

// Standalone functions for injection or direct call
function substringAfter(str, pattern) {
    return String(str || '').substringAfter(pattern);
}

function substringAfterLast(str, pattern) {
    return String(str || '').substringAfterLast(pattern);
}

function substringBefore(str, pattern) {
    return String(str || '').substringBefore(pattern);
}

function substringBeforeLast(str, pattern) {
    return String(str || '').substringBeforeLast(pattern);
}

function substringBetween(str, left, right) {
    return String(str || '').substringBetween(left, right);
}

module.exports = {
    initStringExtensions,
    substringAfter,
    substringAfterLast,
    substringBefore,
    substringBeforeLast,
    substringBetween
};
