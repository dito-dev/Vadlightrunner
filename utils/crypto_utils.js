const CryptoJS = require('crypto-js');

/**
 * Unpacks Dean Edwards JS packed code (p,a,c,k,e,d).
 * Handles radix up to base62 safely without throwing RangeErrors.
 */
function unpackJs(packed) {
    if (!packed || typeof packed !== 'string') return '';
    try {
        const pattern = /}\s*\(\s*['"]([\s\S]*?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]*?)['"]\s*\.split\(['"]\|['"]\)/;
        let match = packed.match(pattern);
        if (!match) {
            const altPattern = /\(\s*['"]([\s\S]*?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]*?)['"]\s*\.split\(['"]\|['"]\)/;
            match = packed.match(altPattern);
        }
        if (!match) return packed;

        let p = match[1];
        const a = parseInt(match[2], 10);
        let c = parseInt(match[3], 10);
        const k = match[4].split('|');

        function toBase(n) {
            return (n < a ? '' : toBase(Math.floor(n / a))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
        }

        while (c--) {
            if (k[c]) {
                const reg = new RegExp('\\b' + toBase(c) + '\\b', 'g');
                p = p.replace(reg, k[c]);
            }
        }
        return p;
    } catch (e) {
        console.error('unpackJs error:', e.message);
        return packed;
    }
}

/**
 * Deobfuscates JS password strings (charCode arrays or hex encoded string representations).
 */
function deobfuscateJsPassword(inputString) {
    if (!inputString || typeof inputString !== 'string') return '';
    try {
        if (/^(\d+\s*,\s*)+\d+$/.test(inputString.trim())) {
            return inputString.split(',').map(n => String.fromCharCode(parseInt(n.trim(), 10))).join('');
        }
        if (/^(\\x[0-9a-fA-F]{2})+$/.test(inputString.trim())) {
            return inputString.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        }
        return inputString;
    } catch (e) {
        return inputString;
    }
}

/**
 * CryptoJS AES encryption matching OpenSSL EVP_BytesToKey format.
 */
function encryptAESCryptoJS(plainText, passphrase) {
    if (plainText === undefined || plainText === null) return '';
    if (!passphrase) return String(plainText);
    return CryptoJS.AES.encrypt(String(plainText), String(passphrase)).toString();
}

/**
 * CryptoJS AES decryption matching OpenSSL EVP_BytesToKey format.
 */
function decryptAESCryptoJS(encrypted, passphrase) {
    if (!encrypted || !passphrase) return '';
    try {
        const bytes = CryptoJS.AES.decrypt(String(encrypted), String(passphrase));
        return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error('decryptAESCryptoJS error:', e.message);
        return '';
    }
}

/**
 * General AES CBC/ECB crypto handler with key and IV.
 */
function cryptoHandler(text, iv, secretKeyString, encrypt = false) {
    if (!text || !secretKeyString) return '';
    try {
        const key = CryptoJS.enc.Utf8.parse(secretKeyString);
        const ivParsed = iv ? CryptoJS.enc.Utf8.parse(iv) : CryptoJS.enc.Utf8.parse('');
        const mode = iv ? CryptoJS.mode.CBC : CryptoJS.mode.ECB;

        if (encrypt) {
            const encrypted = CryptoJS.AES.encrypt(String(text), key, {
                iv: ivParsed,
                mode: mode,
                padding: CryptoJS.pad.Pkcs7
            });
            return encrypted.toString();
        } else {
            const decrypted = CryptoJS.AES.decrypt(String(text), key, {
                iv: ivParsed,
                mode: mode,
                padding: CryptoJS.pad.Pkcs7
            });
            return decrypted.toString(CryptoJS.enc.Utf8);
        }
    } catch (e) {
        console.error('cryptoHandler error:', e.message);
        return '';
    }
}

/**
 * AES-256-GCM decryption using Node.js native crypto.
 * Matches Mangayomi's MBridge.decryptAESGCM(ciphertext, key, iv, tag).
 * 
 * @param {string} ciphertext - Base64-encoded ciphertext
 * @param {string} keyHex - Hex-encoded 256-bit key
 * @param {string} ivHex - Hex-encoded IV (typically 12 bytes)
 * @param {string} tagHex - Hex-encoded auth tag (16 bytes). If empty, assumes tag is appended to ciphertext.
 * @returns {string} Decrypted UTF-8 plaintext
 */
function decryptAESGCM(ciphertext, keyHex, ivHex, tagHex) {
    if (!ciphertext || !keyHex || !ivHex) return '';
    try {
        const crypto = require('crypto');
        const key = Buffer.from(keyHex, 'hex');
        const iv = Buffer.from(ivHex, 'hex');
        let encData = Buffer.from(ciphertext, 'base64');
        let tag;

        if (tagHex && tagHex.length > 0) {
            tag = Buffer.from(tagHex, 'hex');
        } else {
            // Auth tag is appended to the ciphertext (last 16 bytes)
            tag = encData.slice(encData.length - 16);
            encData = encData.slice(0, encData.length - 16);
        }

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encData, null, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('decryptAESGCM error:', e.message);
        return '';
    }
}

/**
 * Find and unpack ALL eval(function(p,a,c,k,e,d){...}) packed blocks in the
 * given source code, and return their unpacked output concatenated.
 * Matches Mangayomi's JsUnpacker.unpackAndCombine().
 */
function unpackJsAndCombine(source) {
    if (!source || typeof source !== 'string') return '';
    try {
        const results = [];
        // Match all eval(function(p,a,c,k,e,d) blocks
        const evalPattern = /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\(['"][\s\S]*?['"],\s*\d+,\s*\d+,\s*['"][\s\S]*?['"]\s*\.split\(['"][\s\S]*?['"]\)\s*[,)]/g;
        let match;
        while ((match = evalPattern.exec(source)) !== null) {
            const unpacked = unpackJs(match[0]);
            if (unpacked && unpacked !== match[0]) {
                results.push(unpacked);
            }
        }
        return results.join('\n');
    } catch (e) {
        console.error('unpackJsAndCombine error:', e.message);
        return '';
    }
}

module.exports = {
    CryptoJS,
    unpackJs,
    unpackJsAndCombine,
    deobfuscateJsPassword,
    encryptAESCryptoJS,
    decryptAESCryptoJS,
    decryptAESGCM,
    cryptoHandler
};
