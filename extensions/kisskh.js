const mangayomiSources = [{
    "name": "KissKH",
    "lang": "en",
    "baseUrl": "https://kisskh.nl",
    "apiUrl": "https://kisskh.nl/api",
    "iconUrl": "https://kisskh.nl/favicon.ico",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.4",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": true,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/mangayomi-extensionstet2/main/javascript/anime/src/en/working/kisskh.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 982348123,
    "notes": "KissKH Asian Drama & Anime Streaming with Native kkey Encryption Cipher",
    "pkgPath": "anime/src/en/working/kisskh.js"
}];

// --- Native KissKH kkey Cipher Engine ---
class KissKKeyCipher {
    static hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
        }
        return hash;
    }

    static pkcs7Pad(str) {
        const padLen = 16 - (str.length % 16);
        for (let i = 0; i < padLen; i++) {
            str += String.fromCharCode(padLen);
        }
        return str;
    }

    static stringToWords(str) {
        const len = str.length;
        const words = [];
        for (let i = 0; i < len; i++) {
            words[i >>> 2] |= (0xff & str.charCodeAt(i)) << (24 - (i % 4) * 8);
        }
        return [words, len];
    }

    static wordsToHex(words, len) {
        const hex = [];
        for (let i = 0; i < len; i++) {
            hex.push(((words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff).toString(16).padStart(2, '0'));
        }
        return hex.join('');
    }

    static generateKKey(epId, isSub) {
        const appVer = "2.8.10";
        const guid = isSub ? "VgV52sWhwvBSf8BsM3BRY9weWiiCbtGp" : "62f176f3bb1b5b8e70e39932ad34a0c7";
        const platformVer = "4830201";
        const appName = "kisskh";

        const parts = [
            '',
            epId || '',
            '',
            'mg3c3b04ba',
            appVer,
            guid,
            platformVer,
            appName,
            appName,
            appName,
            appName,
            appName,
            appName,
            '00',
            ''
        ];

        const checksum = this.hashString(parts.join('|'));
        parts.splice(1, 0, checksum);

        const paddedStr = this.pkcs7Pad(parts.join('|'));
        const [words, len] = this.stringToWords(paddedStr);

        this.encryptWords(words);
        return this.wordsToHex(words, len).toUpperCase();
    }

    static encryptWords(words) {
        const tables = this.getTables();
        const [sbox, t0, t1, t2, t3, invSbox] = tables;
        const len = words.length;

        for (let offset = 0; offset < len; offset += 4) {
            let iv;
            if (offset === 0) {
                iv = [0x1504af3, 0x56e619cf, 0x2e42bba6, -0x73c08f07];
            } else {
                iv = words.slice(offset - 4, offset);
            }

            for (let i = 0; i < 4; i++) {
                words[offset + i] ^= iv[i];
            }

            let s0 = words[offset] ^ sbox[0];
            let s1 = words[offset + 1] ^ sbox[1];
            let s2 = words[offset + 2] ^ sbox[2];
            let s3 = words[offset + 3] ^ sbox[3];
            let ptr = 4;

            for (let round = 1; round < 10; round++) {
                const t0_val = t0[s0 >>> 24] ^ t1[(s1 >>> 16) & 0xff] ^ t2[(s2 >>> 8) & 0xff] ^ t3[s3 & 0xff] ^ sbox[ptr++];
                const t1_val = t0[s1 >>> 24] ^ t1[(s2 >>> 16) & 0xff] ^ t2[(s3 >>> 8) & 0xff] ^ t3[s0 & 0xff] ^ sbox[ptr++];
                const t2_val = t0[s2 >>> 24] ^ t1[(s3 >>> 16) & 0xff] ^ t2[(s0 >>> 8) & 0xff] ^ t3[s1 & 0xff] ^ sbox[ptr++];
                s3 = t0[s3 >>> 24] ^ t1[(s0 >>> 16) & 0xff] ^ t2[(s1 >>> 8) & 0xff] ^ t3[s2 & 0xff] ^ sbox[ptr++];
                s0 = t0_val;
                s1 = t1_val;
                s2 = t2_val;
            }

            const out0 = (invSbox[s0 >>> 24] << 24 | invSbox[(s1 >>> 16) & 0xff] << 16 | invSbox[(s2 >>> 8) & 0xff] << 8 | invSbox[s3 & 0xff]) ^ sbox[ptr++];
            const out1 = (invSbox[s1 >>> 24] << 24 | invSbox[(s2 >>> 16) & 0xff] << 16 | invSbox[(s3 >>> 8) & 0xff] << 8 | invSbox[s0 & 0xff]) ^ sbox[ptr++];
            const out2 = (invSbox[s2 >>> 24] << 24 | invSbox[(s3 >>> 16) & 0xff] << 16 | invSbox[(s0 >>> 8) & 0xff] << 8 | invSbox[s1 & 0xff]) ^ sbox[ptr++];
            const out3 = (invSbox[s3 >>> 24] << 24 | invSbox[(s0 >>> 16) & 0xff] << 16 | invSbox[(s1 >>> 8) & 0xff] << 8 | invSbox[s2 & 0xff]) ^ sbox[ptr++];

            words[offset] = out0;
            words[offset + 1] = out1;
            words[offset + 2] = out2;
            words[offset + 3] = out3;
        }
    }

    static getTables() {
        if (this._tables) return this._tables;
        const sbox = [
            0x4f6bdaa3, -0x61d07350, 0x7f5e722d, -0x61210cec, 0x536620a8, -0x32b653e8, -0x4de821cb, 0x2cc92d21,
            -0x73412227, 0x41f771c1, -0xc1f500c, -0x20d67d2b, 0x2dadde47, 0x6c5aaf86, -0x6045ff8e, 0x409382a7,
            -0x6417db2, -0x6a1bd238, 0xa5e2dba, 0x4acdaf1d, 0x54c72698, -0x3edcf4b0, -0x3482d916, -0x7e4f7609,
            -0x6c9fb16c, 0x524345c4, -0x66c19cd2, 0x188eead9, -0x351884c7, -0x675bc103, 0x19a5dd3, 0x1914b70a,
            -0x4fb1e313, 0x28ea2210, 0x29707fc3, 0x3064c8c9, -0x17593e17, -0x3fb31c07, -0x16c363c6, -0x26a7ab0d,
            -0x4b793324, 0x74ca2f25, -0x62094ce1, 0x44aee7ec
        ];
        const d = [];
        for (let i = 0; i < 256; i++) {
            d[i] = i < 128 ? i << 1 : (i << 1) ^ 0x11b;
        }
        let p = 0, q = 0;
        const t0 = [], t1 = [], t2 = [], t3 = [], invSbox = [];
        for (let i = 0; i < 256; i++) {
            let s = q ^ (q << 1) ^ (q << 2) ^ (q << 3) ^ (q << 4);
            s = (s >>> 8) ^ (s & 0xff) ^ 0x63;
            invSbox[p] = s;
            const x = d[p], y = d[d[x]], z = (0x101 * d[s]) ^ (0x1010100 * s);
            t0[p] = (z << 24) | (z >>> 8);
            t1[p] = (z << 16) | (z >>> 16);
            t2[p] = (z << 8) | (z >>> 24);
            t3[p] = z;
            if (p) {
                p = x ^ d[d[d[y ^ x]]];
                q ^= d[d[q]];
            } else {
                p = q = 1;
            }
        }
        this._tables = [sbox, t0, t1, t2, t3, invSbox];
        return this._tables;
    }
}

// --- Native KissKH Subtitle Decryption Engine ---
class KissSubDecryptor {
    static getKeys(ext) {
        if (ext.includes('.txt1')) {
            return {
                key: [65, 109, 83, 109, 90, 86, 99, 72, 57, 51, 85, 81, 85, 101, 122, 105],
                iv: [82, 101, 66, 75, 87, 87, 56, 99, 113, 100, 106, 80, 69, 110, 70, 54]
            };
        }
        if (ext.endsWith('.txt')) {
            return {
                key: [56, 48, 53, 54, 52, 56, 51, 54, 52, 54, 51, 50, 56, 55, 54, 51],
                iv: [54, 56, 53, 50, 54, 49, 50, 51, 55, 48, 49, 56, 53, 50, 55, 51]
            };
        }
        return {
            key: [115, 87, 79, 68, 88, 88, 48, 52, 81, 82, 84, 107, 72, 100, 108, 90],
            iv: [56, 112, 119, 104, 97, 112, 74, 101, 67, 52, 104, 114, 83, 57, 104, 79]
        };
    }

    static base64ToBytes(b64) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let str = b64.replace(/=+$/, '');
        let bytes = [];
        for (let i = 0; i < str.length; i += 4) {
            let n = (chars.indexOf(str[i]) << 18) |
                (chars.indexOf(str[i + 1]) << 12) |
                ((chars.indexOf(str[i + 2]) & 63) << 6) |
                (chars.indexOf(str[i + 3]) & 63);
            bytes.push((n >> 16) & 255);
            if (str[i + 2] !== undefined && str[i + 2] !== '=') bytes.push((n >> 8) & 255);
            if (str[i + 3] !== undefined && str[i + 3] !== '=') bytes.push(n & 255);
        }
        return bytes;
    }

    static bytesToUtf8(bytes) {
        let out = '';
        let i = 0;
        while (i < bytes.length) {
            let c = bytes[i++];
            if (c < 128) {
                out += String.fromCharCode(c);
            } else if (c > 191 && c < 224) {
                out += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
            } else if (c > 223 && c < 240) {
                out += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
            } else {
                let u = ((c & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
                u -= 0x10000;
                out += String.fromCharCode((u >> 10) + 0xD800, (u & 0x3FF) + 0xDC00);
            }
        }
        return out;
    }

    static stringToBase64(str) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let utf8Bytes = [];
        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i);
            if (code < 128) {
                utf8Bytes.push(code);
            } else if (code < 2048) {
                utf8Bytes.push((code >> 6) | 192, (code & 63) | 128);
            } else if ((code & 0xFC00) === 0xD800 && i + 1 < str.length && (str.charCodeAt(i + 1) & 0xFC00) === 0xDC00) {
                code = 0x10000 + ((code & 0x03FF) << 10) + (str.charCodeAt(++i) & 0x03FF);
                utf8Bytes.push((code >> 18) | 240, ((code >> 12) & 63) | 128, ((code >> 6) & 63) | 128, (code & 63) | 128);
            } else {
                utf8Bytes.push((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128);
            }
        }
        let res = "";
        let i = 0;
        for (; i + 2 < utf8Bytes.length; i += 3) {
            res += chars[utf8Bytes[i] >> 2];
            res += chars[((utf8Bytes[i] & 3) << 4) | (utf8Bytes[i + 1] >> 4)];
            res += chars[((utf8Bytes[i + 1] & 15) << 2) | (utf8Bytes[i + 2] >> 6)];
            res += chars[utf8Bytes[i + 2] & 63];
        }
        if (i < utf8Bytes.length) {
            res += chars[utf8Bytes[i] >> 2];
            if (i + 1 < utf8Bytes.length) {
                res += chars[((utf8Bytes[i] & 3) << 4) | (utf8Bytes[i + 1] >> 4)];
                res += chars[(utf8Bytes[i + 1] & 15) << 2];
                res += "=";
            } else {
                res += chars[(utf8Bytes[i] & 3) << 4];
                res += "==";
            }
        }
        return res;
    }

    static decryptAes128Cbc(ciphertext, keyBytes, ivBytes) {
        const sbox = [
            0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
            0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
            0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
            0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
            0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
            0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
            0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
            0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
            0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
            0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
            0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
            0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
            0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
            0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
            0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
            0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
        ];
        const invSbox = new Array(256);
        for (let i = 0; i < 256; i++) invSbox[sbox[i]] = i;

        const w = new Array(44);
        for (let i = 0; i < 4; i++) {
            w[i] = (keyBytes[4 * i] << 24) | (keyBytes[4 * i + 1] << 16) | (keyBytes[4 * i + 2] << 8) | keyBytes[4 * i + 3];
        }
        const rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
        function subWord(wVal) {
            return (sbox[(wVal >>> 24) & 0xff] << 24) |
                (sbox[(wVal >>> 16) & 0xff] << 16) |
                (sbox[(wVal >>> 8) & 0xff] << 8) |
                sbox[wVal & 0xff];
        }
        function rotWord(wVal) {
            return (wVal << 8) | ((wVal >>> 24) & 0xff);
        }
        for (let i = 4; i < 44; i++) {
            let temp = w[i - 1];
            if (i % 4 === 0) {
                temp = subWord(rotWord(temp)) ^ (rcon[i / 4 - 1] << 24);
            }
            w[i] = w[i - 4] ^ temp;
        }

        function mul(a, b) {
            let p = 0;
            for (let i = 0; i < 8; i++) {
                if (b & 1) p ^= a;
                const hi = a & 0x80;
                a = (a << 1) & 0xff;
                if (hi) a ^= 0x1b;
                b >>>= 1;
            }
            return p;
        }

        function invMixColumns(s) {
            for (let c = 0; c < 4; c++) {
                const s0 = s[c * 4], s1 = s[c * 4 + 1], s2 = s[c * 4 + 2], s3 = s[c * 4 + 3];
                s[c * 4] = mul(s0, 0x0e) ^ mul(s1, 0x0b) ^ mul(s2, 0x0d) ^ mul(s3, 0x09);
                s[c * 4 + 1] = mul(s0, 0x09) ^ mul(s1, 0x0e) ^ mul(s2, 0x0b) ^ mul(s3, 0x0d);
                s[c * 4 + 2] = mul(s0, 0x0d) ^ mul(s1, 0x09) ^ mul(s2, 0x0e) ^ mul(s3, 0x0b);
                s[c * 4 + 3] = mul(s0, 0x0b) ^ mul(s1, 0x0d) ^ mul(s2, 0x09) ^ mul(s3, 0x0e);
            }
        }

        function decryptBlock(block, prevIv) {
            const state = new Array(16);
            for (let i = 0; i < 16; i++) state[i] = block[i];

            for (let c = 0; c < 4; c++) {
                const kw = w[40 + c];
                state[c * 4] ^= (kw >>> 24) & 0xff;
                state[c * 4 + 1] ^= (kw >>> 16) & 0xff;
                state[c * 4 + 2] ^= (kw >>> 8) & 0xff;
                state[c * 4 + 3] ^= kw & 0xff;
            }

            for (let round = 9; round >= 1; round--) {
                const tmp1 = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = tmp1;
                const tmp2 = state[2]; state[2] = state[10]; state[10] = tmp2;
                const tmp6 = state[6]; state[6] = state[14]; state[14] = tmp6;
                const tmp3 = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = tmp3;

                for (let i = 0; i < 16; i++) state[i] = invSbox[state[i]];

                for (let c = 0; c < 4; c++) {
                    const kw = w[round * 4 + c];
                    state[c * 4] ^= (kw >>> 24) & 0xff;
                    state[c * 4 + 1] ^= (kw >>> 16) & 0xff;
                    state[c * 4 + 2] ^= (kw >>> 8) & 0xff;
                    state[c * 4 + 3] ^= kw & 0xff;
                }

                invMixColumns(state);
            }

            const tmp1 = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = tmp1;
            const tmp2 = state[2]; state[2] = state[10]; state[10] = tmp2;
            const tmp6 = state[6]; state[6] = state[14]; state[14] = tmp6;
            const tmp3 = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = tmp3;

            for (let i = 0; i < 16; i++) state[i] = invSbox[state[i]];

            for (let c = 0; c < 4; c++) {
                const kw = w[c];
                state[c * 4] ^= (kw >>> 24) & 0xff;
                state[c * 4 + 1] ^= (kw >>> 16) & 0xff;
                state[c * 4 + 2] ^= (kw >>> 8) & 0xff;
                state[c * 4 + 3] ^= kw & 0xff;
            }

            for (let i = 0; i < 16; i++) state[i] ^= prevIv[i];
            return state;
        }

        const out = [];
        let prev = ivBytes;
        for (let offset = 0; offset < ciphertext.length; offset += 16) {
            const block = ciphertext.slice(offset, offset + 16);
            const decrypted = decryptBlock(block, prev);
            out.push(...decrypted);
            prev = block;
        }

        const padLen = out[out.length - 1];
        if (padLen > 0 && padLen <= 16) {
            out.splice(out.length - padLen, padLen);
        }
        return this.bytesToUtf8(out);
    }

    static decryptLine(line, ext) {
        if (!line || line.length < 10) return line;
        const trimmed = line.trim();
        if (trimmed.includes("-->") || /^\d+$/.test(trimmed)) return line;
        if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) return line;

        const { key, iv } = this.getKeys(ext);
        try {
            const ciphertext = this.base64ToBytes(trimmed);
            return this.decryptAes128Cbc(ciphertext, key, iv);
        } catch (e) {
            return line;
        }
    }

    static decryptSubtitleText(rawContent, ext) {
        const lines = rawContent.split(/\r?\n/);
        const decryptedLines = lines.map(line => this.decryptLine(line, ext));
        let content = decryptedLines.join("\n");
        if (!content.startsWith("WEBVTT")) {
            content = "WEBVTT\n\n" + content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
        }
        return content;
    }
}

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://kisskh.nl";
        this.apiUrl = "https://kisskh.nl/api";
    }

    getBaseUrl() {
        const prefBase = new SharedPreferences().get("base_url");
        return prefBase ? prefBase.trim().replace(/\/$/, "") : this.baseUrl;
    }

    getApiUrl() {
        return this.getBaseUrl() + "/api";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": this.getBaseUrl() + "/"
        };
    }

    async getPopular(page) {
        console.log("KissKH getPopular page=" + page);
        try {
            const url = this.getApiUrl() + "/DramaList/List?page=" + page + "&type=0&sub=0&country=0&status=0&order=2";
            const res = await this.client.get(url, this.getHeaders());
            if (res.statusCode !== 200) return { list: [], hasNextPage: false };

            const data = JSON.parse(res.body);
            const items = data.data || [];
            const list = items.map(item => ({
                name: item.title || "Unknown Title",
                imageUrl: item.thumbnail || "",
                link: this.getBaseUrl() + "/drama/" + item.id
            }));

            const totalCount = data.totalCount || 0;
            const pageSize = data.pageSize || 10;
            const hasNextPage = (page * pageSize) < totalCount;

            return { list, hasNextPage };
        } catch (e) {
            console.log("KissKH getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getLatestUpdates(page) {
        console.log("KissKH getLatestUpdates page=" + page);
        try {
            const url = this.getApiUrl() + "/DramaList/List?page=" + page + "&type=0&sub=0&country=0&status=0&order=1";
            const res = await this.client.get(url, this.getHeaders());
            if (res.statusCode !== 200) return { list: [], hasNextPage: false };

            const data = JSON.parse(res.body);
            const items = data.data || [];
            const list = items.map(item => ({
                name: item.title || "Unknown Title",
                imageUrl: item.thumbnail || "",
                link: this.getBaseUrl() + "/drama/" + item.id
            }));

            const totalCount = data.totalCount || 0;
            const pageSize = data.pageSize || 10;
            const hasNextPage = (page * pageSize) < totalCount;

            return { list, hasNextPage };
        } catch (e) {
            console.log("KissKH getLatestUpdates error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async search(query, page, filters) {
        console.log("KissKH search query=" + query + " page=" + page);
        try {
            let type = "0";
            let sub = "0";
            let country = "0";
            let status = "0";
            let order = "2";

            if (filters && filters.length > 0) {
                for (const filter of filters) {
                    if (filter.type_name === "SelectFilter" && filter.state !== undefined) {
                        const val = filter.values[filter.state].value;
                        if (filter.name === "Type") type = val;
                        else if (filter.name === "Subtitle") sub = val;
                        else if (filter.name === "Country") country = val;
                        else if (filter.name === "Status") status = val;
                        else if (filter.name === "Order") order = val;
                    }
                }
            }

            let url = "";
            if (query && query.trim().length > 0) {
                url = this.getApiUrl() + "/DramaList/Search?q=" + encodeURIComponent(query.trim()) +
                    "&type=" + type + "&sub=" + sub + "&country=" + country + "&status=" + status + "&order=" + order + "&page=" + page;
            } else {
                url = this.getApiUrl() + "/DramaList/List?page=" + page +
                    "&type=" + type + "&sub=" + sub + "&country=" + country + "&status=" + status + "&order=" + order;
            }

            const res = await this.client.get(url, this.getHeaders());
            if (res.statusCode !== 200) return { list: [], hasNextPage: false };

            const data = JSON.parse(res.body);
            let items = [];
            let hasNextPage = false;

            if (Array.isArray(data)) {
                items = data;
                hasNextPage = false;
            } else if (data && data.data) {
                items = data.data;
                const totalCount = data.totalCount || 0;
                const pageSize = data.pageSize || 10;
                hasNextPage = (page * pageSize) < totalCount;
            }

            const list = items.map(item => ({
                name: item.title || "Unknown Title",
                imageUrl: item.thumbnail || "",
                link: this.getBaseUrl() + "/drama/" + item.id
            }));

            return { list, hasNextPage };
        } catch (e) {
            console.log("KissKH search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getDetail(url) {
        console.log("KissKH getDetail: " + url);
        try {
            const idMatch = url.match(/\/drama\/(\d+)/) || url.match(/\/watch\/(\d+)/);
            if (!idMatch) throw new Error("Invalid drama URL: " + url);
            const dramaId = idMatch[1];

            const detailUrl = this.getApiUrl() + "/DramaList/Drama/" + dramaId + "?isq=false";
            const res = await this.client.get(detailUrl, this.getHeaders());
            if (res.statusCode !== 200) throw new Error("Failed to fetch detail status=" + res.statusCode);

            const drama = JSON.parse(res.body);

            let status = 5; // Unknown
            if (drama.status) {
                const s = drama.status.toLowerCase();
                if (s.includes("ongoing")) status = 0;
                else if (s.includes("completed")) status = 1;
            }

            const chapters = [];
            if (drama.episodes && Array.isArray(drama.episodes)) {
                for (const ep of drama.episodes) {
                    chapters.push({
                        name: "Episode " + ep.number,
                        url: this.getBaseUrl() + "/watch/" + dramaId + "?ep=" + ep.id,
                        dateUpload: null
                    });
                }
            }

            return {
                name: drama.title || "Unknown Title",
                imageUrl: drama.thumbnail || "",
                description: drama.description ? drama.description.replace(/\r\n/g, "\n") : "",
                genre: drama.country ? [drama.country, drama.type].filter(Boolean) : [],
                status: status,
                chapters: chapters
            };
        } catch (e) {
            console.log("KissKH getDetail error: " + e);
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
        }
    }

    async getVideoList(url) {
        console.log("KissKH getVideoList: " + url);
        try {
            const epMatch = url.match(/[?&]ep=(\d+)/);
            if (!epMatch) return [];
            const epId = epMatch[1];

            const prefs = new SharedPreferences();
            let streamKey = prefs.get("stream_key") || "";
            let subKey = prefs.get("sub_key") || "";

            const headers = this.getHeaders();
            const href = url;

            // Generate kkey dynamically if preference is empty
            if (!streamKey) {
                streamKey = KissKKeyCipher.generateKKey(epId, false);
            }
            if (!subKey) {
                subKey = KissKKeyCipher.generateKKey(epId, true);
            }

            const videoApiUrl = this.getApiUrl() + "/DramaList/Episode/" + epId + ".png?err=false&ts=null&time=null&kkey=" + encodeURIComponent(streamKey);
            const subApiUrl = this.getApiUrl() + "/Sub/" + epId + "?kkey=" + encodeURIComponent(subKey);

            const videos = [];
            const subtitles = [];

            // Fetch video and subtitle lists concurrently
            const [videoRes, subRes] = await Promise.all([
                this.client.get(videoApiUrl, headers).catch(() => null),
                this.client.get(subApiUrl, headers).catch(() => null)
            ]);

            // Process subtitles
            if (subRes && subRes.statusCode === 200 && subRes.body) {
                try {
                    const subData = JSON.parse(subRes.body);
                    if (Array.isArray(subData)) {
                        for (const sub of subData) {
                            if (sub.src) {
                                let subFileUrl = sub.src;
                                const isEncrypted = /\.(txt|txt1|txt2|txt3)(\?|$)/i.test(sub.src);

                                // Only fetch and decrypt if the subtitle file is encrypted (.txt, .txt1, .txt2, .txt3)
                                if (isEncrypted) {
                                    const isEnglish = (sub.label && sub.label.toLowerCase().includes("eng")) || (sub.land && sub.land.toLowerCase() === "en") || sub.default;
                                    if (isEnglish) {
                                        try {
                                            const rawSubRes = await this.client.get(sub.src, headers);
                                            if (rawSubRes.statusCode === 200 && rawSubRes.body) {
                                                const decryptedText = KissSubDecryptor.decryptSubtitleText(rawSubRes.body, sub.src);
                                                subFileUrl = "data:text/vtt;charset=utf-8;base64," + KissSubDecryptor.stringToBase64(decryptedText);
                                            }
                                        } catch (_) { }
                                    }
                                }

                                subtitles.push({
                                    file: subFileUrl,
                                    label: sub.label || sub.land || "Subtitle"
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.log("KissKH subtitle parse error: " + err);
                }
            }

            // Process video stream URL
            if (videoRes && videoRes.statusCode === 200 && videoRes.body) {
                try {
                    let streamUrl = "";
                    try {
                        const data = JSON.parse(videoRes.body);
                        streamUrl = data.Video || data.video || data.url || (typeof data === "string" ? data : "");
                    } catch (_) {
                        streamUrl = videoRes.body;
                    }

                    if (streamUrl && streamUrl.startsWith("http")) {
                        videos.push({
                            url: streamUrl,
                            originalUrl: streamUrl,
                            quality: "KissKH Stream",
                            subtitles: subtitles,
                            headers: {
                                "User-Agent": headers["User-Agent"],
                                "Referer": this.getBaseUrl() + "/"
                            }
                        });
                    }
                } catch (vErr) {
                    console.log("KissKH video process error: " + vErr);
                }
            }

            return videos;
        } catch (e) {
            console.log("KissKH getVideoList error: " + e);
            return [];
        }
    }

    async getPageList(url) {
        return [];
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Type",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "0" },
                    { type_name: "SelectOption", name: "TV Series", value: "1" },
                    { type_name: "SelectOption", name: "Movie", value: "2" },
                    { type_name: "SelectOption", name: "Anime", value: "3" },
                    { type_name: "SelectOption", name: "Hollywood", value: "4" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Subtitle",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "0" },
                    { type_name: "SelectOption", name: "Subbed", value: "1" },
                    { type_name: "SelectOption", name: "Dubbed", value: "2" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Country",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "0" },
                    { type_name: "SelectOption", name: "China", value: "1" },
                    { type_name: "SelectOption", name: "South Korea", value: "2" },
                    { type_name: "SelectOption", name: "Japan", value: "3" },
                    { type_name: "SelectOption", name: "Hong Kong", value: "4" },
                    { type_name: "SelectOption", name: "Thailand", value: "5" },
                    { type_name: "SelectOption", name: "United States", value: "6" },
                    { type_name: "SelectOption", name: "Taiwan", value: "7" },
                    { type_name: "SelectOption", name: "Philippines", value: "8" },
                    { type_name: "SelectOption", name: "Indonesia", value: "9" },
                    { type_name: "SelectOption", name: "Singapore", value: "10" },
                    { type_name: "SelectOption", name: "Vietnam", value: "11" },
                    { type_name: "SelectOption", name: "Turkey", value: "12" },
                    { type_name: "SelectOption", name: "India", value: "13" },
                    { type_name: "SelectOption", name: "Malaysia", value: "14" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "0" },
                    { type_name: "SelectOption", name: "Ongoing", value: "1" },
                    { type_name: "SelectOption", name: "Completed", value: "2" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Order",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Latest Drama", value: "2" },
                    { type_name: "SelectOption", name: "Latest Episode", value: "1" },
                    { type_name: "SelectOption", name: "Alphabetical", value: "3" },
                    { type_name: "SelectOption", name: "Oldest", value: "0" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "base_url",
                editTextPreference: {
                    title: "Base Domain",
                    summary: "Default domain for KissKH API requests",
                    value: "https://kisskh.nl",
                    dialogTitle: "Base Domain",
                    dialogMessage: "Enter Base URL (e.g., https://kisskh.nl or https://kisskh.co)"
                }
            },
            {
                key: "stream_key",
                editTextPreference: {
                    title: "Override Stream kkey Token",
                    summary: "Optional manual kkey token (leave blank for automatic generation)",
                    value: "",
                    dialogTitle: "Stream kkey",
                    dialogMessage: "Enter manual kkey token for stream endpoint"
                }
            },
            {
                key: "sub_key",
                editTextPreference: {
                    title: "Override Subtitle kkey Token",
                    summary: "Optional manual kkey token (leave blank for automatic generation)",
                    value: "",
                    dialogTitle: "Subtitle kkey",
                    dialogMessage: "Enter manual kkey token for subtitle endpoint"
                }
            }
        ];
    }
}
