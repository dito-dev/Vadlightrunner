/**
 * Extension Skeleton Generator v2
 * 
 * Smart template system that generates production-ready Mangayomi extension
 * skeletons with realistic boilerplate, pre-filled methods, filter presets,
 * and SharedPreferences templates.
 * 
 * Templates:
 *   - api-json:     REST/JSON API sources (like Animetsu) — PRIORITY TEMPLATE
 *   - html-scraper: DOM-based HTML scraping sources (like WcoTV, TokyoInsider)
 *   - hybrid:       Sites using both API endpoints and HTML scraping
 *   - manga-reader: Manga/manhwa sources with getPageList() image extraction
 */

const fs = require('fs');
const path = require('path');

// ─── ID Generator ──────────────────────────────────────────────────────────

/**
 * Generate a unique numeric ID from the extension name.
 * @param {string} name - Extension name
 * @returns {number} A deterministic numeric ID
 */
function generateId(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        const ch = name.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// ─── Template Definitions ──────────────────────────────────────────────────

/**
 * List all available templates with descriptions and details.
 * @returns {Array} Template info objects
 */
function listTemplates() {
    return [
        {
            type: 'api-json',
            description: 'REST/JSON API source (recommended for most sites)',
            details: 'Pre-filled with JSON parsing, pagination, search with filters, episode/server extraction. Based on the Animetsu pattern.',
            category: 'anime',
            example: 'Animetsu, AnikotoAPI'
        },
        {
            type: 'html-scraper',
            description: 'HTML DOM scraping source',
            details: 'Pre-filled with Document/Element CSS selector patterns, DOM traversal, and common HTML extraction logic.',
            category: 'anime',
            example: 'WcoTV, TokyoInsider'
        },
        {
            type: 'hybrid',
            description: 'Mixed API + HTML scraping source',
            details: 'Uses API for listings/search but falls back to HTML scraping for detail/video pages. Common for sites with partial APIs.',
            category: 'anime',
            example: 'AnimoTV, KissKH'
        },
        {
            type: 'manga-reader',
            description: 'Manga/manhwa reader source',
            details: 'Includes getPageList() for chapter image extraction, chapter listing, and manga-specific filters.',
            category: 'manga',
            example: 'MangaDex-style sources'
        },
        // Legacy aliases for backward compatibility
        {
            type: 'anime',
            description: 'Alias for api-json template',
            details: 'Maps to api-json. Use api-json directly for more control.',
            category: 'anime',
            hidden: true
        },
        {
            type: 'manga',
            description: 'Alias for manga-reader template',
            details: 'Maps to manga-reader. Use manga-reader directly for more control.',
            category: 'manga',
            hidden: true
        }
    ];
}

// ─── Metadata Block Generator ──────────────────────────────────────────────

function generateMetadataBlock(opts) {
    const { name, baseUrl, apiUrl, lang, isNsfw, isManga, itemType, id, fileName, sourceType } = opts;

    return `const mangayomiSources = [{
    "name": "${name}",
    "lang": "${lang}",
    "baseUrl": "${baseUrl}",
    "apiUrl": "${apiUrl || ''}",
    "iconUrl": "${baseUrl}/favicon.ico",
    "typeSource": "single",
    "isManga": ${isManga},
    "itemType": ${itemType},
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": ${isNsfw},
    "hasCloudflare": false,
    "sourceCodeUrl": "",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": ${id},
    "notes": "${name} ${sourceType} extension.",
    "pkgPath": "${sourceType}/src/${lang}/working/${fileName}"
}];`;
}

// ─── Header Generators ────────────────────────────────────────────────────

function generateApiHeaders(baseUrl) {
    return `    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.5",
            "Origin": "${baseUrl}",
            "Referer": "${baseUrl}/"
        };
    }

    getStreamHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Referer": "${baseUrl}/"
        };
    }`;
}

function generateHtmlHeaders(baseUrl) {
    return `    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Referer": "${baseUrl}/"
        };
    }

    getStreamHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Referer": "${baseUrl}/"
        };
    }`;
}

// ─── Filter Presets ────────────────────────────────────────────────────────

function getAnimeFilterPreset() {
    return `    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Popularity", value: "popularity" },
                    { type_name: "SelectOption", name: "Latest", value: "date_desc" },
                    { type_name: "SelectOption", name: "Rating", value: "rating" },
                    { type_name: "SelectOption", name: "A-Z", value: "title_asc" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Ongoing", value: "ongoing" },
                    { type_name: "SelectOption", name: "Completed", value: "completed" },
                    { type_name: "SelectOption", name: "Upcoming", value: "upcoming" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Type",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "TV", value: "tv" },
                    { type_name: "SelectOption", name: "Movie", value: "movie" },
                    { type_name: "SelectOption", name: "OVA", value: "ova" },
                    { type_name: "SelectOption", name: "ONA", value: "ona" },
                    { type_name: "SelectOption", name: "Special", value: "special" }
                ]
            }
        ];
    }`;
}

function getMangaFilterPreset() {
    return `    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Latest Updates", value: "latest" },
                    { type_name: "SelectOption", name: "Popularity", value: "popular" },
                    { type_name: "SelectOption", name: "Rating", value: "rating" },
                    { type_name: "SelectOption", name: "A-Z", value: "title" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Ongoing", value: "ongoing" },
                    { type_name: "SelectOption", name: "Completed", value: "completed" },
                    { type_name: "SelectOption", name: "Hiatus", value: "hiatus" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Type",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Manga", value: "manga" },
                    { type_name: "SelectOption", name: "Manhwa", value: "manhwa" },
                    { type_name: "SelectOption", name: "Manhua", value: "manhua" },
                    { type_name: "SelectOption", name: "Webtoon", value: "webtoon" }
                ]
            }
        ];
    }`;
}

// ─── SharedPreferences Presets ──────────────────────────────────────────────

function getAnimePreferencesPreset() {
    return `
    getSourcePreferences() {
        return [
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred Quality",
                    summary: "Select default video quality",
                    valueIndex: 1,
                    entries: ["360p", "720p", "1080p", "4K"],
                    entryValues: ["360", "720", "1080", "2160"]
                }
            },
            {
                key: "preferred_audio",
                listPreference: {
                    title: "Preferred Audio",
                    summary: "Select subtitle or dubbed audio",
                    valueIndex: 0,
                    entries: ["Sub", "Dub"],
                    entryValues: ["sub", "dub"]
                }
            }
        ];
    }`;
}

function getMangaPreferencesPreset() {
    return `
    getSourcePreferences() {
        return [
            {
                key: "image_quality",
                listPreference: {
                    title: "Image Quality",
                    summary: "Select default image quality for chapter pages",
                    valueIndex: 1,
                    entries: ["Low", "Medium", "High"],
                    entryValues: ["low", "medium", "high"]
                }
            }
        ];
    }`;
}

// ─── Template: API-JSON (Priority Template) ────────────────────────────────

function generateApiJsonTemplate(opts) {
    const { name, baseUrl, lang, isNsfw } = opts;
    const apiUrl = opts.apiUrl || baseUrl + '/api';

    const templateOpts = {
        ...opts,
        apiUrl,
        isManga: false,
        itemType: 1,
        sourceType: 'anime',
        id: generateId(name),
        fileName: name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.js'
    };

    return `${generateMetadataBlock(templateOpts)}

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "${baseUrl}";
        this.apiUrl = "${apiUrl}";
    }

${generateApiHeaders(baseUrl)}

    // ── Helper: Parse a list of items from JSON API response ──
    parseItemList(data) {
        var list = [];
        var items = data.results || data.data || data.items || [];
        for (var item of items) {
            list.push({
                name: item.title || item.name || "Unknown",
                imageUrl: item.image || item.poster || item.cover || item.thumbnail || "",
                link: this.baseUrl + "/anime/" + (item.id || item.slug || "")
            });
        }
        return list;
    }

    async getPopular(page) {
        var url = this.apiUrl + "/popular?page=" + page;
        var res = await this.client.get(url, this.getHeaders());
        var data = JSON.parse(res.body);

        var list = this.parseItemList(data);
        var hasNextPage = (data.last_page || data.totalPages || 1) > page;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getLatestUpdates(page) {
        var url = this.apiUrl + "/latest?page=" + page;
        var res = await this.client.get(url, this.getHeaders());
        var data = JSON.parse(res.body);

        var list = this.parseItemList(data);
        var hasNextPage = (data.last_page || data.totalPages || 1) > page;

        return { list: list, hasNextPage: hasNextPage };
    }

    async search(query, page, filters) {
        var url = this.apiUrl + "/search?page=" + page;
        if (query) {
            url += "&query=" + encodeURIComponent(query);
        }

        // Apply filters from getFilterList
        if (filters && filters.length > 0) {
            for (var filter of filters) {
                if (filter.type_name === "SelectFilter") {
                    var selectedValue = filter.values[filter.state].value;
                    if (selectedValue) {
                        if (filter.name === "Sort By") {
                            url += "&sort=" + selectedValue;
                        } else if (filter.name === "Status") {
                            url += "&status=" + selectedValue;
                        } else if (filter.name === "Type") {
                            url += "&type=" + selectedValue;
                        }
                    }
                }
            }
        }

        var res = await this.client.get(url, this.getHeaders());
        var data = JSON.parse(res.body);

        var list = this.parseItemList(data);
        var hasNextPage = (data.last_page || data.totalPages || 1) > page;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        // Extract ID from URL  e.g. /anime/12345 → 12345
        var match = url.match(/\\/anime\\/([a-zA-Z0-9_\\-]+)/);
        if (!match) throw new Error("Invalid URL: " + url);
        var id = match[1];

        // Fetch anime info
        var infoRes = await this.client.get(this.apiUrl + "/info/" + id, this.getHeaders());
        var info = JSON.parse(infoRes.body);

        // Fetch episode list
        var epsRes = await this.client.get(this.apiUrl + "/episodes/" + id, this.getHeaders());
        var eps = JSON.parse(epsRes.body);
        var episodeList = eps.episodes || eps.data || eps || [];

        var chapters = [];
        for (var ep of episodeList) {
            chapters.push({
                name: "Episode " + (ep.number || ep.ep_num || "") + (ep.title ? (" - " + ep.title) : ""),
                url: this.baseUrl + "/watch/" + id + "?ep=" + (ep.number || ep.ep_num || ""),
                dateUpload: ep.aired_at ? String(new Date(ep.aired_at).getTime()) : null
            });
        }
        chapters.reverse();

        // Map status string to Mangayomi status codes
        // 0=Ongoing, 1=Completed, 2=Licensed, 3=Publishing Finished, 4=Cancelled, 5=On Hiatus
        var status = 5;
        var statusStr = (info.status || "").toUpperCase();
        if (statusStr === "RELEASING" || statusStr === "ONGOING" || statusStr === "AIRING") status = 0;
        else if (statusStr === "FINISHED" || statusStr === "COMPLETED") status = 1;
        else if (statusStr === "CANCELLED") status = 4;
        else if (statusStr === "HIATUS") status = 5;

        return {
            name: info.title || info.name || "Unknown",
            imageUrl: info.image || info.poster || info.cover || "",
            description: (info.description || info.synopsis || "").replace(/<[^>]*>/g, ''),
            genre: info.genres || [],
            status: status,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        // Extract anime ID and episode number from URL
        var idMatch = url.match(/\\/watch\\/([a-zA-Z0-9_\\-]+)/);
        var epMatch = url.match(/[?&]ep=([\\w]+)/);
        if (!idMatch || !epMatch) return [];

        var animeId = idMatch[1];
        var epNum = epMatch[1];

        // Fetch available servers/sources
        var serversRes = await this.client.get(
            this.apiUrl + "/servers/" + animeId + "/" + epNum,
            this.getHeaders()
        );
        var servers = JSON.parse(serversRes.body);
        var serverList = servers.servers || servers.data || servers || [];

        var videos = [];
        var streamHeaders = this.getStreamHeaders();
        var audioType = new SharedPreferences().get("preferred_audio") || "sub";

        for (var server of serverList) {
            try {
                var sourceUrl = this.apiUrl + "/sources/" + animeId + "/" + epNum
                    + "?server=" + (server.id || server.name || "")
                    + "&type=" + audioType;
                var sourceRes = await this.client.get(sourceUrl, this.getHeaders());
                var sourceData = JSON.parse(sourceRes.body);

                // Extract subtitles if available
                var subtitles = [];
                if (sourceData.subtitles && Array.isArray(sourceData.subtitles)) {
                    for (var sub of sourceData.subtitles) {
                        subtitles.push({
                            label: sub.lang || sub.label || "Unknown",
                            file: sub.url || sub.file || ""
                        });
                    }
                }

                // Extract video sources
                var sources = sourceData.sources || sourceData.data || [];
                for (var src of sources) {
                    var videoUrl = src.url || src.file || "";
                    var label = (server.name || server.id || "Server").toUpperCase()
                        + " - " + (src.quality || "Auto")
                        + " (" + audioType.toUpperCase() + ")";

                    videos.push({
                        url: videoUrl,
                        originalUrl: videoUrl,
                        quality: label,
                        subtitles: subtitles,
                        headers: streamHeaders
                    });
                }
            } catch (e) {
                console.log("Error fetching server " + (server.id || server.name) + ": " + e.message);
            }
        }

        return videos;
    }

    async getPageList(url) {
        return [];
    }

${getAnimeFilterPreset()}
${getAnimePreferencesPreset()}
}
`;
}

// ─── Template: HTML-SCRAPER ────────────────────────────────────────────────

function generateHtmlScraperTemplate(opts) {
    const { name, baseUrl, lang, isNsfw } = opts;

    const templateOpts = {
        ...opts,
        apiUrl: '',
        isManga: false,
        itemType: 1,
        sourceType: 'anime',
        id: generateId(name),
        fileName: name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.js'
    };

    return `${generateMetadataBlock(templateOpts)}

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "${baseUrl}";
    }

${generateHtmlHeaders(baseUrl)}

    // ── Helper: Parse item cards from an HTML listing page ──
    parseListingPage(html) {
        var doc = new Document(html);
        var list = [];

        // TODO: Update the CSS selector to match the site's card/item container
        var items = doc.select(".anime-card, .item, .video-block");
        for (var el of items) {
            var linkEl = el.selectFirst("a");
            var imgEl = el.selectFirst("img");
            var titleEl = el.selectFirst(".title, .name, h3, h2");

            var itemLink = linkEl ? linkEl.attr("href") || "" : "";
            if (itemLink && !itemLink.startsWith("http")) {
                itemLink = this.baseUrl + itemLink;
            }

            list.push({
                name: titleEl ? titleEl.text.trim() : "",
                imageUrl: imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "",
                link: itemLink
            });
        }

        return list;
    }

    async getPopular(page) {
        // TODO: Update URL path for the site's popular/trending page
        var url = this.baseUrl + "/popular?page=" + page;
        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        // TODO: Update pagination detection (check for next page link/button)
        var doc = new Document(res.body);
        var hasNextPage = doc.selectFirst(".pagination .next, a.next-page, .load-more") !== null;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getLatestUpdates(page) {
        // TODO: Update URL path for latest updates
        var url = this.baseUrl + "/latest?page=" + page;
        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        var doc = new Document(res.body);
        var hasNextPage = doc.selectFirst(".pagination .next, a.next-page") !== null;

        return { list: list, hasNextPage: hasNextPage };
    }

    async search(query, page, filters) {
        // TODO: Update search URL pattern
        var url = this.baseUrl + "/search?q=" + encodeURIComponent(query) + "&page=" + page;

        // Apply filters
        if (filters && filters.length > 0) {
            for (var filter of filters) {
                if (filter.type_name === "SelectFilter") {
                    var selectedValue = filter.values[filter.state].value;
                    if (selectedValue) {
                        if (filter.name === "Sort By") url += "&sort=" + selectedValue;
                        else if (filter.name === "Status") url += "&status=" + selectedValue;
                        else if (filter.name === "Type") url += "&type=" + selectedValue;
                    }
                }
            }
        }

        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        var doc = new Document(res.body);
        var hasNextPage = doc.selectFirst(".pagination .next, a.next-page") !== null;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        var res = await this.client.get(url, this.getHeaders());
        var doc = new Document(res.body);

        // TODO: Update CSS selectors for the detail page
        var title = doc.selectFirst("h1, .anime-title, .entry-title");
        var image = doc.selectFirst(".poster img, .thumb img, .cover img");
        var synopsis = doc.selectFirst(".synopsis, .description, .entry-content p");

        // Extract genres
        var genreEls = doc.select(".genre a, .genres a, .tag");
        var genres = [];
        for (var g of genreEls) {
            genres.push(g.text.trim());
        }

        // Extract episodes
        // TODO: Update episode list selector
        var epEls = doc.select(".episode-list a, .episodes li a, .ep-list a");
        var chapters = [];
        for (var ep of epEls) {
            var epLink = ep.attr("href") || "";
            if (epLink && !epLink.startsWith("http")) {
                epLink = this.baseUrl + epLink;
            }
            chapters.push({
                name: ep.text.trim() || "Episode",
                url: epLink
            });
        }
        chapters.reverse();

        // Detect status from text
        var statusEl = doc.selectFirst(".status, .info-status");
        var status = 5;
        if (statusEl) {
            var statusText = statusEl.text.toUpperCase();
            if (statusText.includes("ONGOING") || statusText.includes("AIRING")) status = 0;
            else if (statusText.includes("COMPLETED") || statusText.includes("FINISHED")) status = 1;
        }

        return {
            name: title ? title.text.trim() : "",
            imageUrl: image ? (image.attr("data-src") || image.attr("src") || "") : "",
            description: synopsis ? synopsis.text.trim() : "",
            genre: genres,
            status: status,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        var res = await this.client.get(url, this.getHeaders());
        var doc = new Document(res.body);

        var videos = [];
        var streamHeaders = this.getStreamHeaders();

        // Strategy 1: Look for direct video source tags
        var sourceEls = doc.select("video source, source[type*=video]");
        for (var src of sourceEls) {
            var videoUrl = src.attr("src") || "";
            if (videoUrl) {
                videos.push({
                    url: videoUrl,
                    originalUrl: videoUrl,
                    quality: src.attr("label") || src.attr("size") || "Default",
                    headers: streamHeaders
                });
            }
        }

        // Strategy 2: Look for iframe embeds
        if (videos.length === 0) {
            var iframes = doc.select("iframe[src]");
            for (var iframe of iframes) {
                var iframeSrc = iframe.attr("src") || "";
                if (iframeSrc && (iframeSrc.includes("embed") || iframeSrc.includes("player"))) {
                    // TODO: Fetch the iframe page and extract the real video URL
                    // var embedRes = await this.client.get(iframeSrc, this.getStreamHeaders());
                    // Use extractDirectVideoUrls(embedRes.body) or parseM3U8Qualities()
                    console.log("Found embed iframe: " + iframeSrc);
                }
            }
        }

        // Strategy 3: Look for video URLs in page scripts
        if (videos.length === 0) {
            var scriptVideos = extractDirectVideoUrls(res.body);
            for (var sv of scriptVideos) {
                sv.headers = streamHeaders;
                videos.push(sv);
            }
        }

        return videos;
    }

    async getPageList(url) {
        return [];
    }

${getAnimeFilterPreset()}
${getAnimePreferencesPreset()}
}
`;
}

// ─── Template: HYBRID ──────────────────────────────────────────────────────

function generateHybridTemplate(opts) {
    const { name, baseUrl, lang, isNsfw } = opts;
    const apiUrl = opts.apiUrl || baseUrl + '/api';

    const templateOpts = {
        ...opts,
        apiUrl,
        isManga: false,
        itemType: 1,
        sourceType: 'anime',
        id: generateId(name),
        fileName: name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.js'
    };

    return `${generateMetadataBlock(templateOpts)}

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "${baseUrl}";
        this.apiUrl = "${apiUrl}";
    }

    // API headers for JSON endpoints
    getApiHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Accept": "application/json, text/plain, */*",
            "Origin": "${baseUrl}",
            "Referer": "${baseUrl}/"
        };
    }

    // HTML headers for scraping pages
    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": "${baseUrl}/"
        };
    }

    getStreamHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Referer": "${baseUrl}/"
        };
    }

    // ── Listings use the API ──

    async getPopular(page) {
        var url = this.apiUrl + "/popular?page=" + page;
        var res = await this.client.get(url, this.getApiHeaders());
        var data = JSON.parse(res.body);

        var list = [];
        var items = data.results || data.data || [];
        for (var item of items) {
            list.push({
                name: item.title || item.name || "Unknown",
                imageUrl: item.image || item.poster || "",
                link: this.baseUrl + "/anime/" + (item.id || item.slug || "")
            });
        }

        return { list: list, hasNextPage: (data.last_page || 1) > page };
    }

    async getLatestUpdates(page) {
        var url = this.apiUrl + "/latest?page=" + page;
        var res = await this.client.get(url, this.getApiHeaders());
        var data = JSON.parse(res.body);

        var list = [];
        var items = data.results || data.data || [];
        for (var item of items) {
            list.push({
                name: item.title || item.name || "Unknown",
                imageUrl: item.image || item.poster || "",
                link: this.baseUrl + "/anime/" + (item.id || item.slug || "")
            });
        }

        return { list: list, hasNextPage: (data.last_page || 1) > page };
    }

    async search(query, page, filters) {
        var url = this.apiUrl + "/search?q=" + encodeURIComponent(query || "") + "&page=" + page;

        if (filters && filters.length > 0) {
            for (var filter of filters) {
                if (filter.type_name === "SelectFilter") {
                    var val = filter.values[filter.state].value;
                    if (val) {
                        if (filter.name === "Sort By") url += "&sort=" + val;
                        else if (filter.name === "Status") url += "&status=" + val;
                    }
                }
            }
        }

        var res = await this.client.get(url, this.getApiHeaders());
        var data = JSON.parse(res.body);

        var list = [];
        var items = data.results || data.data || [];
        for (var item of items) {
            list.push({
                name: item.title || item.name || "Unknown",
                imageUrl: item.image || item.poster || "",
                link: this.baseUrl + "/anime/" + (item.id || item.slug || "")
            });
        }

        return { list: list, hasNextPage: (data.last_page || 1) > page };
    }

    // ── Detail and video pages use HTML scraping ──

    async getDetail(url) {
        var res = await this.client.get(url, this.getHeaders());
        var doc = new Document(res.body);

        // TODO: Update selectors for the specific site
        var title = doc.selectFirst("h1, .title");
        var image = doc.selectFirst(".poster img, .cover img");
        var synopsis = doc.selectFirst(".synopsis, .description");

        var genreEls = doc.select(".genre a, .genres a");
        var genres = [];
        for (var g of genreEls) genres.push(g.text.trim());

        // Extract episodes from the HTML page
        var epEls = doc.select(".episode-list a, .episodes li a");
        var chapters = [];
        for (var ep of epEls) {
            var epLink = ep.attr("href") || "";
            if (epLink && !epLink.startsWith("http")) epLink = this.baseUrl + epLink;
            chapters.push({
                name: ep.text.trim() || "Episode",
                url: epLink
            });
        }
        chapters.reverse();

        return {
            name: title ? title.text.trim() : "",
            imageUrl: image ? (image.attr("data-src") || image.attr("src") || "") : "",
            description: synopsis ? synopsis.text.trim() : "",
            genre: genres,
            status: 5,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        var res = await this.client.get(url, this.getHeaders());
        var doc = new Document(res.body);
        var videos = [];
        var streamHeaders = this.getStreamHeaders();

        // Look for embedded video sources in the HTML
        var scriptVideos = extractDirectVideoUrls(res.body);
        for (var sv of scriptVideos) {
            sv.headers = streamHeaders;
            videos.push(sv);
        }

        // Check iframes for embedded players
        if (videos.length === 0) {
            var iframes = doc.select("iframe[src]");
            for (var iframe of iframes) {
                var iframeSrc = iframe.attr("src") || "";
                if (iframeSrc) {
                    if (!iframeSrc.startsWith("http")) iframeSrc = "https:" + iframeSrc;
                    try {
                        var embedRes = await this.client.get(iframeSrc, this.getStreamHeaders());
                        var embedVideos = extractDirectVideoUrls(embedRes.body);
                        for (var ev of embedVideos) {
                            ev.headers = streamHeaders;
                            videos.push(ev);
                        }
                    } catch (e) {
                        console.log("Failed to fetch embed: " + iframeSrc + " — " + e.message);
                    }
                }
            }
        }

        return videos;
    }

    async getPageList(url) {
        return [];
    }

${getAnimeFilterPreset()}
${getAnimePreferencesPreset()}
}
`;
}

// ─── Template: MANGA-READER ────────────────────────────────────────────────

function generateMangaReaderTemplate(opts) {
    const { name, baseUrl, lang, isNsfw } = opts;

    const templateOpts = {
        ...opts,
        apiUrl: '',
        isManga: true,
        itemType: 0,
        sourceType: 'manga',
        id: generateId(name),
        fileName: name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.js'
    };

    return `${generateMetadataBlock(templateOpts)}

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "${baseUrl}";
    }

${generateHtmlHeaders(baseUrl)}

    // ── Helper: Parse manga cards from a listing page ──
    parseListingPage(html) {
        var doc = new Document(html);
        var list = [];

        // TODO: Update CSS selectors for the manga site's card layout
        var items = doc.select(".manga-card, .item, .page-item-detail");
        for (var el of items) {
            var linkEl = el.selectFirst("a");
            var imgEl = el.selectFirst("img");
            var titleEl = el.selectFirst(".title, .post-title h3, h3");

            var itemLink = linkEl ? linkEl.attr("href") || "" : "";
            if (itemLink && !itemLink.startsWith("http")) itemLink = this.baseUrl + itemLink;

            list.push({
                name: titleEl ? titleEl.text.trim() : "",
                imageUrl: imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "",
                link: itemLink
            });
        }

        return list;
    }

    async getPopular(page) {
        // TODO: Update URL for popular manga page
        var url = this.baseUrl + "/popular?page=" + page;
        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        var doc = new Document(res.body);
        var hasNextPage = doc.selectFirst(".pagination .next, a.next-page") !== null;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getLatestUpdates(page) {
        // TODO: Update URL for latest updates
        var url = this.baseUrl + "/latest?page=" + page;
        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        var doc = new Document(res.body);
        var hasNextPage = doc.selectFirst(".pagination .next, a.next-page") !== null;

        return { list: list, hasNextPage: hasNextPage };
    }

    async search(query, page, filters) {
        var url = this.baseUrl + "/search?q=" + encodeURIComponent(query) + "&page=" + page;

        if (filters && filters.length > 0) {
            for (var filter of filters) {
                if (filter.type_name === "SelectFilter") {
                    var val = filter.values[filter.state].value;
                    if (val) {
                        if (filter.name === "Sort By") url += "&sort=" + val;
                        else if (filter.name === "Status") url += "&status=" + val;
                        else if (filter.name === "Type") url += "&type=" + val;
                    }
                }
            }
        }

        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        var doc = new Document(res.body);
        var hasNextPage = doc.selectFirst(".pagination .next, a.next-page") !== null;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        var res = await this.client.get(url, this.getHeaders());
        var doc = new Document(res.body);

        // TODO: Update CSS selectors for the manga detail page
        var title = doc.selectFirst("h1, .manga-title, .post-title h1");
        var image = doc.selectFirst(".summary_image img, .thumb img, .poster img");
        var synopsis = doc.selectFirst(".summary__content, .description, .manga-excerpt");

        // Extract genres
        var genreEls = doc.select(".genres a, .genre a, .tag");
        var genres = [];
        for (var g of genreEls) genres.push(g.text.trim());

        // Extract chapters
        // TODO: Update chapter list selectors
        var chapterEls = doc.select(".chapter-list a, .chapters li a, .wp-manga-chapter a");
        var chapters = [];
        for (var ch of chapterEls) {
            var chLink = ch.attr("href") || "";
            if (chLink && !chLink.startsWith("http")) chLink = this.baseUrl + chLink;

            // Try to extract chapter date
            var dateEl = ch.parent ? ch.parent.selectFirst(".chapter-date, .release-date, span.on") : null;
            var dateUpload = null;
            if (dateEl) {
                try {
                    dateUpload = String(new Date(dateEl.text.trim()).getTime());
                } catch (e) { /* ignore parse errors */ }
            }

            chapters.push({
                name: ch.text.trim() || "Chapter",
                url: chLink,
                dateUpload: dateUpload
            });
        }
        // Chapters are usually listed newest-first on manga sites, reverse for chronological order
        // chapters.reverse();  // Uncomment if the site lists oldest-first

        // Detect status
        var statusEl = doc.selectFirst(".status, .manga-status, .post-status .summary-content");
        var status = 5;
        if (statusEl) {
            var statusText = statusEl.text.toUpperCase();
            if (statusText.includes("ONGOING")) status = 0;
            else if (statusText.includes("COMPLETED")) status = 1;
            else if (statusText.includes("HIATUS")) status = 5;
        }

        return {
            name: title ? title.text.trim() : "",
            imageUrl: image ? (image.attr("data-src") || image.attr("src") || "") : "",
            description: synopsis ? synopsis.text.trim() : "",
            genre: genres,
            status: status,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        return [];
    }

    async getPageList(url) {
        var res = await this.client.get(url, this.getHeaders());
        var doc = new Document(res.body);

        var pages = [];

        // Strategy 1: Image elements in the reader container
        // TODO: Update the CSS selector for the chapter reader images
        var imgEls = doc.select(".reader-area img, .chapter-content img, .page-break img, #readerarea img");
        for (var img of imgEls) {
            var imgUrl = img.attr("data-src") || img.attr("src") || "";
            if (imgUrl) {
                if (!imgUrl.startsWith("http")) {
                    imgUrl = this.baseUrl + imgUrl;
                }
                pages.push({
                    url: imgUrl,
                    headers: this.getHeaders()
                });
            }
        }

        // Strategy 2: Pages stored in a JavaScript array
        if (pages.length === 0) {
            // Some sites store pages in a JS variable like: var pages = ["url1", "url2", ...]
            var bodyHtml = doc.outerHtml || "";
            var arrayMatch = bodyHtml.match(/(?:var|let|const)\\s+(?:pages|images|chapter_images)\\s*=\\s*(\\[[^\\]]+\\])/);
            if (arrayMatch) {
                try {
                    var urls = JSON.parse(arrayMatch[1]);
                    for (var u of urls) {
                        if (u && typeof u === "string") {
                            pages.push({ url: u, headers: this.getHeaders() });
                        }
                    }
                } catch (e) {
                    console.log("Failed to parse page array: " + e.message);
                }
            }
        }

        return pages;
    }

${getMangaFilterPreset()}
${getMangaPreferencesPreset()}
}
`;
}

// ─── Main Generator ────────────────────────────────────────────────────────

/**
 * Generate an extension skeleton using the specified template.
 * 
 * @param {Object} options
 * @param {string} options.name - Extension display name (e.g., "MyAnimeSite")
 * @param {string} options.baseUrl - Base URL of the website
 * @param {string} options.apiUrl - API URL (optional, defaults to baseUrl/api for API templates)
 * @param {string} options.template - Template type: api-json, html-scraper, hybrid, manga-reader
 * @param {string} options.lang - Language code (default: "en")
 * @param {boolean} options.isNsfw - NSFW flag (default: false)
 * @param {boolean} options.isManga - Manga flag (default: auto-detected from template)
 * @param {string} options.outputDir - Output directory (default: ".")
 * @returns {Object} { filePath, fileName, name, id, type, template }
 */
function generateSkeleton(options = {}) {
    const {
        name = 'MyExtension',
        baseUrl = 'https://example.com',
        apiUrl = '',
        lang = 'en',
        isNsfw = false,
        outputDir = '.'
    } = options;

    // Resolve template type (with backward-compat aliases)
    let template = options.template || 'api-json';
    let isManga = options.isManga;

    // Legacy backward compat: old callers pass isManga=true without template
    if (isManga === true && !options.template) {
        template = 'manga-reader';
    } else if (isManga === false && !options.template) {
        template = 'api-json';
    }

    // Handle legacy template aliases
    if (template === 'anime') template = 'api-json';
    if (template === 'manga') template = 'manga-reader';

    // Auto-detect isManga from template if not explicitly set
    if (isManga === undefined || isManga === null) {
        isManga = template === 'manga-reader';
    }

    const fileName = name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.js';
    const id = generateId(name);
    const sourceType = isManga ? 'manga' : 'anime';

    const templateOpts = { name, baseUrl, apiUrl, lang, isNsfw, isManga };

    // Select and generate the template
    let code;
    switch (template) {
        case 'api-json':
            code = generateApiJsonTemplate(templateOpts);
            break;
        case 'html-scraper':
            code = generateHtmlScraperTemplate(templateOpts);
            break;
        case 'hybrid':
            code = generateHybridTemplate(templateOpts);
            break;
        case 'manga-reader':
            code = generateMangaReaderTemplate(templateOpts);
            break;
        default:
            throw new Error(`Unknown template '${template}'. Available: api-json, html-scraper, hybrid, manga-reader`);
    }

    const outputPath = path.join(outputDir, fileName);
    fs.writeFileSync(outputPath, code, 'utf8');

    return {
        filePath: outputPath,
        fileName,
        name,
        id,
        type: sourceType,
        template
    };
}

module.exports = { generateSkeleton, generateId, listTemplates };
