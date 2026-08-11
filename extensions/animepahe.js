const mangayomiSources = [{
    "name": "AnimePahe [OK]",
    "lang": "en",
    "baseUrl": "https://animepahe.pw",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=animepahe.pw",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.9",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": true,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/animepahe.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 847392156,
    "notes": "AnimePahe [OK]",
    "pkgPath": "working/animepahe.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://animepahe.pw";
        
        // --- CLOUDFLARE COOKIE BYPASS SETTINGS ---
        // You can paste your values directly here or input them in the extension preferences.
        this.cfClearance = "m0XEMAh1WDXVmeVqNcl2pR5TkYxVbgGjW1ye5KtVNd8-1782639676-1.2.1.1-qqdxFLbCqJne6nftrmkT0yq2TMJiumciST29aboi9EeWflJyU5K8JhXUVH7uQtm1X4VmdNHR57QWVP29VPCqHk3Af6PgoP0ttwtAMjgWQaeeRyDS5DbgmIPGBxahyv4Kr.aqG3q5XNlz9ANeUjRMY3jjl07hU8MHX4t9yMeYIMcyM.chF6mqHtCtSDOWDNY8kk1oyhDeiyPBjBbz._ixX5BoJUkUI.SyXeUf9cW.jsUOzHD4XwnkjYnq6jJAZfSo.KJBQv1fN4.MMU2RVQ518jrutgLHMaC8UvKQa5IHNYMgMNy4u6_sybHQuHTzcI_jfby2Ll3l2Gzy7kHizzCG_HuAGl0DfkDiwwyWbS8KtPdLtBifyFPeIe7oJU6WbYoUUzrJwuOVSX4lI0YtK3lrS32ecZm2wUHczcg0h0HstqI3uYIB3Do_YieChVhe"; 
        this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0";
    }

    async customGet(url, headers) {
        // Fetch scraper pages/APIs directly to avoid Cloudflare Worker WAF blocks on animepahe.pw
        return await this.client.get(url, headers);
    }

    proxyVideoUrl(m3u8) {
        if (!m3u8) return "";
        var workerProxy = new SharedPreferences().get("cf_worker_proxy") || "https://m3u8-cors-proxy.dito21525.workers.dev";
        var baseProxy = workerProxy.trim().replace(/\/v2\/?$/, "").replace(/\/$/, "");
        var videoHeaders = { "Referer": "https://kwik.cx/" };
        return baseProxy + "/v2?url=" + encodeURIComponent(m3u8) + "&headers=" + encodeURIComponent(JSON.stringify(videoHeaders));
    }

    getHeaders() {
        var pref = new SharedPreferences();
        var ua = pref.get("custom_user_agent") || this.userAgent;
        var cf = pref.get("cf_clearance") || this.cfClearance;

        var headers = {
            "User-Agent": ua,
            "Referer": this.baseUrl + "/",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest"
        };

        if (cf) {
            headers["Cookie"] = "cf_clearance=" + cf;
        }
        return headers;
    }

    getPageHeaders() {
        var pref = new SharedPreferences();
        var ua = pref.get("custom_user_agent") || this.userAgent;
        var cf = pref.get("cf_clearance") || this.cfClearance;

        var headers = {
            "User-Agent": ua,
            "Referer": this.baseUrl + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        };

        if (cf) {
            headers["Cookie"] = "cf_clearance=" + cf;
        }
        return headers;
    }

    // ── API helper ────────────────────────────────────────────────────────────
    async apiGet(params) {
        var url = this.baseUrl + "/api?" + params;
        console.log("API GET: " + url);
        var res = await this.customGet(url, this.getHeaders());
        if (res.statusCode !== 200) {
            console.log("API status: " + res.statusCode);
            throw new Error("API returned " + res.statusCode);
        }
        return JSON.parse(res.body);
    }

    // ── Poster URL builder ────────────────────────────────────────────────────
    buildPoster(poster) {
        if (!poster) return "";
        if (poster.startsWith("http")) return poster;
        return this.baseUrl + poster;
    }

    // ── getPopular (uses airing endpoint) ─────────────────────────────────────
    async getPopular(page) {
        console.log("AnimePahe [OK]" + page);
        try {
            var data = await this.apiGet("m=airing&page=" + page);
            var list = [];
            var items = data.data || [];
            for (var item of items) {
                list.push({
                    name: item.anime_title || item.title || "",
                    imageUrl: item.snapshot || item.anime_image || item.poster || "",
                    link: item.anime_session || item.session || ""
                });
            }
            var hasNextPage = data.current_page < data.last_page;
            console.log("getPopular: " + list.length + " results, page " + data.current_page + "/" + data.last_page);
            return { list, hasNextPage };
        } catch (e) {
            console.log("getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    // ── getLatestUpdates ──────────────────────────────────────────────────────
    async getLatestUpdates(page) {
        // Same as popular — airing shows the latest episode releases
        return await this.getPopular(page);
    }

    // ── search ────────────────────────────────────────────────────────────────
    async search(query, page, filters) {
        console.log("AnimePahe [OK]" + query);
        try {
            var data = await this.apiGet("m=search&q=" + encodeURIComponent(query));
            var list = [];
            var items = data.data || [];
            for (var item of items) {
                list.push({
                    name: item.title || "",
                    imageUrl: item.poster || item.image || "",
                    link: item.session || ""
                });
            }
            console.log("search: " + list.length + " results");
            return { list, hasNextPage: false };
        } catch (e) {
            console.log("search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    // ── getDetail ─────────────────────────────────────────────────────────────
    async getDetail(url) {
        console.log("AnimePahe [OK]" + url);
        try {
            var animeSession = url;
            var pageUrl = this.baseUrl + "/anime/" + animeSession;

            // Scrape the anime detail page for metadata
            var res = await this.customGet(pageUrl, this.getPageHeaders());
            var title = "";
            var imageUrl = "";
            var description = "";
            var genre = [];
            var status = 5;

            if (res.statusCode === 200) {
                var doc = new Document(res.body);

                // Title
                try { title = doc.selectFirst("h1 span, .title-wrapper h1, .header-wrapper h1").text || ""; } catch (e) {}
                if (!title) {
                    try {
                        var ogTitle = doc.selectFirst("meta[property='og:title']");
                        if (ogTitle) title = ogTitle.attr("content") || "";
                    } catch (e) {}
                }

                // Image
                try {
                    var posterEl = doc.selectFirst(".anime-poster img, .poster-wrapper img, .anime-info img");
                    if (posterEl) imageUrl = posterEl.attr("src") || posterEl.attr("data-src") || "";
                } catch (e) {}
                if (!imageUrl) {
                    try {
                        var ogImg = doc.selectFirst("meta[property='og:image']");
                        if (ogImg) imageUrl = ogImg.attr("content") || "";
                    } catch (e) {}
                }

                // Description
                try {
                    var descEl = doc.selectFirst(".anime-synopsis, .anime-summary, .synopsis-desc");
                    if (descEl) description = descEl.text || "";
                } catch (e) {}
                if (!description) {
                    try {
                        var ogDesc = doc.selectFirst("meta[property='og:description']");
                        if (ogDesc) description = ogDesc.attr("content") || "";
                    } catch (e) {}
                }

                // Genres
                try {
                    var genreEls = doc.select(".anime-genre ul li a, .anime-info .genre a, a[href*='/genre/']");
                    for (var g of genreEls) {
                        var gText = g.text.trim();
                        if (gText) genre.push(gText);
                    }
                } catch (e) {}

                // Status
                try {
                    var statusEls = doc.select(".anime-info p, .anime-detail p");
                    for (var sEl of statusEls) {
                        var txt = (sEl.text || "").toLowerCase();
                        if (txt.includes("status")) {
                            if (txt.includes("currently airing") || txt.includes("ongoing")) status = 0;
                            else if (txt.includes("finished") || txt.includes("completed")) status = 1;
                            break;
                        }
                    }
                } catch (e) {}
            }

            // Fetch episodes via API (paginated)
            var chapters = [];
            var episodePage = 1;
            var hasMore = true;

            while (hasMore) {
                try {
                    var epData = await this.apiGet("m=release&id=" + animeSession + "&sort=episode_desc&page=" + episodePage);
                    var epItems = epData.data || [];

                    for (var ep of epItems) {
                        var epNum = ep.episode || 0;
                        var epSession = ep.session || "";
                        chapters.push({
                            name: "Episode " + epNum,
                            url: animeSession + "||" + epSession,
                            dateUpload: ep.created_at ? String(new Date(ep.created_at).getTime()) : null
                        });
                    }

                    hasMore = epData.current_page < epData.last_page;
                    episodePage++;
                } catch (e) {
                    console.log("Episode fetch error page " + episodePage + ": " + e);
                    hasMore = false;
                }
            }

            console.log("getDetail: " + title + ", " + chapters.length + " episodes");

            return {
                link: pageUrl,
                name: title || "AnimePahe [OK]",
                imageUrl,
                description,
                genre,
                status,
                chapters
            };
        } catch (e) {
            console.log("getDetail error: " + e);
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
        }
    }

    // ── Pure-JS p,a,c,k unpacker (avoids Mangayomi's broken unpackJs()) ─────────
    // Mangayomi's built-in unpackJs() throws RangeError for Kwik's base-62 packer.
    // This reimplements the standard dean.edwards.name/packer decoder in plain JS.
    manualUnpack(packed) {
        try {
            // Extract the 4 arguments: encoded-string, base/radix, num-identifiers, key-array
            var m = packed.match(/\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\s*\.split\(/);
            if (!m) return "";
            var p = m[1];
            var a = parseInt(m[2], 10);
            var c = parseInt(m[3], 10);
            var k = m[4].split("|");

            // Reproduce the packer's base-encode function
            function toBase(n) {
                var r = "";
                if (n >= a) r = toBase(Math.floor(n / a));
                n = n % a;
                if (n > 35) r += String.fromCharCode(n + 29);
                else r += n.toString(36);
                return r;
            }

            // Build identifier→value lookup table
            var d = {};
            for (var i = 0; i < c; i++) {
                var key = toBase(i);
                d[key] = k[i] !== undefined && k[i] !== "" ? k[i] : key;
            }

            // Replace every word-boundary token in the encoded string
            return p.replace(/\b\w+\b/g, function (w) {
                return d.hasOwnProperty(w) ? d[w] : w;
            });
        } catch (e) {
            console.log("manualUnpack error: " + e);
            return "";
        }
    }

    // ── Kwik extraction ───────────────────────────────────────────────────────
    // AnimePahe uses Kwik as its video host. The flow is:
    //  1. links API returns: {data:[{"1080p":{kwik:"https://kwik.cx/e/XXXX"}}]}
    //  2. Fetch kwik embed page with Referer: animepahe.pw
    //  3. Kwik page has packed JS: eval(function(p,a,c,k,e,d){...}) with base-62 encoding
    //  4. manualUnpack() decodes it to find the .m3u8 URL (owocdn.top/vault-*.owocdn.top)

    async extractKwikUrl(playPageUrl) {
        console.log("Fetching play page: " + playPageUrl);
        var res = await this.customGet(playPageUrl, this.getPageHeaders());
        if (res.statusCode !== 200) {
            console.log("Play page status: " + res.statusCode);
            return [];
        }

        var body = res.body;
        var videos = [];

        // Find all kwik embed URLs and their quality labels
        // Pattern: looking for buttons/links with quality info and kwik URLs
        // The play page has quality selector buttons and embedded kwik URLs

        // Method 1: Parse the quality buttons and associated URLs from the page
        try {
            var doc = new Document(body);
            var menuItems = doc.select("#resolutionMenu button, #pickDownload a, .dropdown-item");

            for (var item of menuItems) {
                try {
                    var dataSrc = item.attr("data-src") || item.attr("href") || "";
                    var qualityText = item.text.trim();

                    if (dataSrc && dataSrc.includes("kwik")) {
                        var m3u8 = await this.extractM3u8FromKwik(dataSrc);
                        if (m3u8) {
                            videos.push({
                                url: this.proxyVideoUrl(m3u8),
                                originalUrl: m3u8,
                                quality: qualityText || "Default",
                                headers: { "Referer": "https://kwik.cx/" }
                            });
                        }
                    }
                } catch (innerErr) {
                    console.log("Menu item parse error: " + innerErr);
                }
            }
        } catch (e) {
            console.log("DOM parse error: " + e);
        }

        // Method 2: Regex fallback — find kwik URLs directly in the page source
        if (videos.length === 0) {
            try {
                // Match patterns like: "https://kwik.cx/e/XXXXX" or 'https://kwik.cx/f/XXXXX'
                var kwikRegex = /https?:\/\/kwik\.[a-z]+\/[ef]\/[a-zA-Z0-9]+/g;
                var matches = body.match(kwikRegex) || [];

                // Also try to find quality info near the URL
                var qualityRegex = /(\d{3,4})p/g;
                var qualities = body.match(qualityRegex) || ["720p"];

                for (var i = 0; i < matches.length; i++) {
                    var kwikUrl = matches[i];
                    var quality = qualities[i] || qualities[0] || "Default";

                    var m3u8 = await this.extractM3u8FromKwik(kwikUrl);
                    if (m3u8) {
                        videos.push({
                            url: this.proxyVideoUrl(m3u8),
                            originalUrl: m3u8,
                            quality: quality,
                            headers: { "Referer": "https://kwik.cx/" }
                        });
                    }
                }
            } catch (e) {
                console.log("Regex kwik extraction error: " + e);
            }
        }

        return videos;
    }

    async extractM3u8FromKwik(kwikUrl) {
        console.log("Fetching kwik: " + kwikUrl);
        try {
            var pref = new SharedPreferences();
            var ua = pref.get("custom_user_agent") || this.userAgent;
            var headers = {
                "User-Agent": ua,
                "Referer": this.baseUrl + "/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            };

            var res = await this.customGet(kwikUrl, headers);
            if (res.statusCode !== 200) {
                console.log("Kwik status: " + res.statusCode);
                return null;
            }

            var body = res.body;

            // Look for packed JS blocks: eval(function(p,a,c,k,e,d){...}('encoded',a,c,'k|e|y|s'.split('|'),0,{}))
            // Use manualUnpack() — NOT unpackJs() which crashes in Mangayomi's Dart runtime
            var packedMatch = body.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)[\s\S]*?\)\)/g);
            if (packedMatch) {
                for (var i = 0; i < packedMatch.length; i++) {
                    try {
                        var unpacked = this.manualUnpack(packedMatch[i]);
                        if (!unpacked || unpacked.length < 10) continue;
                        console.log("Unpacked kwik JS length: " + unpacked.length);

                        // Find m3u8 URL in unpacked code
                        var m3u8Match = unpacked.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/);
                        if (m3u8Match) {
                            console.log("Found m3u8: " + m3u8Match[0]);
                            return m3u8Match[0];
                        }

                        // Alternative: look for source URL pattern
                        var srcMatch = unpacked.match(/source\s*=\s*["']([^"']+)['"]/);
                        if (srcMatch) {
                            console.log("Found source: " + srcMatch[1]);
                            return srcMatch[1];
                        }

                        // Alternative: look for any owocdn URL
                        var cdnMatch = unpacked.match(/https?:\/\/[^"'\s\\]*owocdn[^"'\s\\]*/);
                        if (cdnMatch) {
                            console.log("Found CDN: " + cdnMatch[0]);
                            return cdnMatch[0];
                        }
                    } catch (unpackErr) {
                        console.log("manualUnpack error for match " + i + ": " + unpackErr);
                    }
                }
            }

            // Direct m3u8 URL in HTML (sometimes not packed)
            var directMatch = body.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/);
            if (directMatch) {
                return directMatch[0];
            }

            // Look for owocdn URL directly
            var owoCdnMatch = body.match(/https?:\/\/[^"'\s]*owocdn\.top[^"'\s]*/);
            if (owoCdnMatch) {
                return owoCdnMatch[0];
            }

        } catch (e) {
            console.log("extractM3u8FromKwik error: " + e);
        }
        return null;
    }

    async getVideoList(url) {
        console.log("AnimePahe [OK]" + url);
        try {
            var parts = url.split("||");
            if (parts.length < 2) {
                console.log("Invalid episode URL format");
                return [];
            }
            var animeSession = parts[0];
            var episodeSession = parts[1];

            var videos = [];
            
            // Method 1: Try links API first
            try {
                var linkData = await this.apiGet("m=links&id=" + episodeSession + "&p=kwik");
                if (linkData && linkData.data) {
                    for (var item of linkData.data) {
                        for (var key in item) {
                            var kwikUrl = item[key].kwik || item[key].kwik_pahewin || "";
                            var quality = key;
                            if (item[key].audio) quality += " (" + item[key].audio + ")";
                            
                            if (kwikUrl) {
                                var m3u8 = await this.extractM3u8FromKwik(kwikUrl);
                                if (m3u8) {
                                    videos.push({
                                        url: this.proxyVideoUrl(m3u8),
                                        originalUrl: m3u8,
                                        quality: "AnimePahe [OK]" + quality,
                                        headers: { "Referer": "https://kwik.cx/" }
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (apiErr) {
                console.log("API links error: " + apiErr);
            }

            // Method 2: Fallback to HTML scraping if API fails or returns no videos
            if (videos.length === 0) {
                var playUrl = this.baseUrl + "/play/" + animeSession + "/" + episodeSession;
                videos = await this.extractKwikUrl(playUrl);
            }

            // Sort by preferred quality — put preferred resolution first
            var prefQuality = new SharedPreferences().get("preferred_quality") || "1080";
            videos.sort(function(a, b) {
                var aMatch = (a.quality || "").includes(prefQuality) ? 0 : 1;
                var bMatch = (b.quality || "").includes(prefQuality) ? 0 : 1;
                return aMatch - bMatch;
            });

            console.log("Total videos: " + videos.length);
            return videos;
        } catch (e) {
            console.log("getVideoList error: " + e);
            return [];
        }
    }

    async getPageList(url) { return []; }
    getFilterList() { return []; }

    getSourcePreferences() {
        return [
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred Quality",
                    summary: "Select your preferred video resolution",
                    valueIndex: 0,
                    entries: ["1080p", "720p", "480p", "360p"],
                    entryValues: ["1080", "720", "480", "360"]
                }
            },
            {
                key: "stream_type",
                listPreference: {
                    title: "Stream Type",
                    summary: "Prefer subtitled (sub) or dubbed (dub) audio",
                    valueIndex: 0,
                    entries: ["Sub", "Dub"],
                    entryValues: ["sub", "dub"]
                }
            },
            {
                key: "cf_worker_proxy",
                editTextPreference: {
                    title: "Cloudflare Worker Proxy URL",
                    summary: "Enter your Cloudflare Worker Proxy URL (e.g. https://your-worker.workers.dev)",
                    value: "",
                    dialogTitle: "Cloudflare Worker Proxy",
                    dialogMessage: "Enter the base URL of your deployed m3u8CloudflareWorkerProxy (e.g., https://your-worker.workers.dev/)"
                }
            },
            {
                key: "cf_clearance",
                editTextPreference: {
                    title: "Cloudflare cf_clearance",
                    summary: "Paste your cf_clearance cookie value here",
                    value: "",
                    dialogTitle: "cf_clearance cookie",
                    dialogMessage: "Enter the cf_clearance cookie value from your web browser"
                }
            },
            {
                key: "custom_user_agent",
                editTextPreference: {
                    title: "Cloudflare User-Agent",
                    summary: "Paste your web browser's User-Agent here",
                    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    dialogTitle: "User-Agent",
                    dialogMessage: "Enter the exact User-Agent string of the browser where you solved the Cloudflare challenge"
                }
            }
        ];
    }
}



