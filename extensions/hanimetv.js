const mangayomiSources = [{
    "name": "Hanime.tv",
    "lang": "en",
    "baseUrl": "https://hanime.tv",
    "apiUrl": "https://cached.freeanimehentai.net",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=hanime.tv",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/hanimetv.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 782317456,
    "notes": "",
    "pkgPath": "nsfw/hanimetv.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://hanime.tv";
        // Real API base discovered via network inspection
        this.apiBase = "https://cached.freeanimehentai.net";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://hanime.tv/",
            "Origin": "https://hanime.tv",
            "X-Signature-Version": "web2",
            "X-Signature": "0",
            "X-Time": String(Math.floor(Date.now() / 1000)),
            "X-Session-Token": "",
            "X-User-License": "",
            "X-License": "",
            "X-Csrf-Token": "",
            "Accept": "application/json",
            "Content-Type": "application/json"
        };
    }

    getPreferredQuality() {
        try {
            var prefs = new SharedPreferences();
            return prefs.getString("preferred_quality", "1080");
        } catch (e) {
            return "1080";
        }
    }

    getPreferredSort() {
        try {
            var prefs = new SharedPreferences();
            return prefs.getString("popular_sort", "views");
        } catch (e) {
            return "views";
        }
    }

    getPageSize() {
        try {
            var prefs = new SharedPreferences();
            return parseInt(prefs.getString("page_size", "32")) || 32;
        } catch (e) {
            return 32;
        }
    }

    // The search_hvs endpoint returns ALL ~3277 videos as a flat array.
    // We fetch it once and paginate client-side.
    async fetchAllVideos() {
        var url = this.apiBase + "/api/v10/search_hvs";
        console.log("fetchAllVideos: " + url);
        var res = await this.client.get(url, this.getHeaders());
        if (res.statusCode !== 200) {
            console.log("fetchAllVideos bad status: " + res.statusCode);
            return [];
        }
        return JSON.parse(res.body);
    }

    parseVideoItems(videos) {
        var list = [];
        if (!Array.isArray(videos)) return list;
        for (var v of videos) {
            try {
                var slug = v.slug || "";
                if (!slug) continue;
                var name = v.name || slug;
                var imageUrl = v.cover_url || v.poster_url || "";
                var link = this.baseUrl + "/videos/hentai/" + slug;
                list.push({ name, imageUrl, link });
            } catch (e) {
                console.log("parseVideoItems error: " + e);
            }
        }
        return list;
    }

    async getPopular(page) {
        console.log("getPopular page=" + page);
        try {
            var PAGE_SIZE = this.getPageSize();
            var all = await this.fetchAllVideos();
            var sortBy = this.getPreferredSort();
            if (sortBy === "likes") {
                all.sort(function(a, b) { return (b.likes || 0) - (a.likes || 0); });
            } else {
                all.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
            }
            var start = (page - 1) * PAGE_SIZE;
            var slice = all.slice(start, start + PAGE_SIZE);
            var list = this.parseVideoItems(slice);
            var hasNextPage = start + PAGE_SIZE < all.length;
            console.log("getPopular results: " + list.length);
            return { list, hasNextPage };
        } catch (e) {
            console.log("getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getLatestUpdates(page) {
        console.log("getLatestUpdates page=" + page);
        try {
            var PAGE_SIZE = this.getPageSize();
            var all = await this.fetchAllVideos();
            // Sort by created_at_unix desc (newest first)
            all.sort(function(a, b) { return (b.created_at_unix || 0) - (a.created_at_unix || 0); });
            var start = (page - 1) * PAGE_SIZE;
            var slice = all.slice(start, start + PAGE_SIZE);
            var list = this.parseVideoItems(slice);
            var hasNextPage = start + PAGE_SIZE < all.length;
            return { list, hasNextPage };
        } catch (e) {
            console.log("getLatestUpdates error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async search(query, page, filters) {
        console.log("search: " + query + " page=" + page);
        try {
            var PAGE_SIZE = this.getPageSize();
            var all = await this.fetchAllVideos();
            var q = query.toLowerCase();
            // Filter by name or search_titles
            var filtered = all.filter(function(v) {
                var searchIn = ((v.name || "") + " " + (v.search_titles || "")).toLowerCase();
                return searchIn.includes(q);
            });
            var start = (page - 1) * PAGE_SIZE;
            var slice = filtered.slice(start, start + PAGE_SIZE);
            var list = this.parseVideoItems(slice);
            var hasNextPage = start + PAGE_SIZE < filtered.length;
            console.log("search results: " + filtered.length + " filtered, showing " + list.length);
            return { list, hasNextPage };
        } catch (e) {
            console.log("search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getDetail(url) {
        console.log("getDetail: " + url);
        try {
            // Extract slug from URL: /videos/hentai/{slug}
            var parts = url.split("/videos/hentai/");
            var slug = parts.length > 1 ? parts[1].split("?")[0].replace(/\/$/, "") : "";
            console.log("slug: " + slug);
            if (!slug) throw new Error("Could not extract slug from URL: " + url);

            var apiUrl = this.apiBase + "/api/v8/video?id=" + slug;
            var res = await this.client.get(apiUrl, this.getHeaders());
            if (res.statusCode !== 200) {
                console.log("getDetail bad status: " + res.statusCode + " for " + apiUrl);
                return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
            }

            var data = JSON.parse(res.body);
            var hv = data.hentai_video || {};

            var title = hv.name || slug;
            var imageUrl = hv.cover_url || hv.poster_url || "";
            var description = hv.description || "";
            // Strip HTML tags from description
            description = description.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim();

            var brand = hv.brand || "";
            if (brand) description = "Studio: " + brand + "\n\n" + description;

            var genre = [];
            var tags = hv.hentai_tags || data.hentai_tags || [];
            for (var tag of tags) {
                var tagText = (typeof tag === "string") ? tag : (tag.text || tag.name || "");
                if (tagText) genre.push(tagText);
            }

            // Build episode list from franchise (actual same-series episodes)
            var chapters = [];
            var franchise = data.hentai_franchise_hentai_videos || [];
            console.log("Franchise episodes: " + franchise.length);

            for (var ep of franchise) {
                try {
                    var epSlug = ep.slug || "";
                    if (!epSlug) continue;
                    var epName = ep.name || ("Episode " + epSlug);
                    var epUrl = this.baseUrl + "/videos/hentai/" + epSlug;
                    chapters.push({ name: epName, url: epUrl });
                } catch (e2) {
                    console.log("Franchise episode parse error: " + e2);
                }
            }

            // Standalone video — single episode
            if (chapters.length === 0) {
                chapters.push({ name: title, url: url });
            }

            return {
                link: url,
                name: title,
                imageUrl,
                description,
                genre,
                status: 5,
                chapters
            };
        } catch (e) {
            console.log("getDetail error: " + e);
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
        }
    }

    async getVideoList(url) {
        console.log("getVideoList: " + url);
        try {
            var parts = url.split("/videos/hentai/");
            var slug = parts.length > 1 ? parts[1].split("?")[0].replace(/\/$/, "") : "";
            console.log("getVideoList slug: " + slug);
            if (!slug) return [];

            // Step 1: Get the numeric hv_id from the video metadata endpoint
            var metaUrl = this.apiBase + "/api/v8/video?id=" + slug;
            var metaRes = await this.client.get(metaUrl, this.getHeaders());
            if (metaRes.statusCode !== 200) {
                console.log("getVideoList meta bad status: " + metaRes.statusCode);
                return [];
            }
            var metaData = JSON.parse(metaRes.body);
            var hvId = (metaData.hentai_video || {}).id;
            if (!hvId) {
                console.log("Could not get hvId for slug: " + slug);
                return [];
            }
            console.log("hvId: " + hvId);

            // Step 2: Fetch the REAL stream manifest via the guest endpoint
            // This returns actual highwinds-cdn.com URLs (not placeholder streamable.cloud ones)
            var manifestUrl = this.apiBase + "/api/v8/guest/videos/" + hvId + "/manifest";
            var manifestRes = await this.client.get(manifestUrl, this.getHeaders());
            if (manifestRes.statusCode !== 200) {
                console.log("getVideoList manifest bad status: " + manifestRes.statusCode);
                return [];
            }

            var data = JSON.parse(manifestRes.body);
            var manifest = data.videos_manifest || {};
            var servers = manifest.servers || [];
            var videos = [];

            console.log("Servers from manifest: " + servers.length);
            for (var server of servers) {
                var serverName = server.name || server.slug || "Server";
                var streams = server.streams || [];
                for (var stream of streams) {
                    try {
                        var streamUrl = stream.url || "";
                        // Skip mock/placeholder URLs from non-guest endpoint
                        if (!streamUrl || streamUrl.includes("streamable.cloud/hls/stream.m3u8") || !stream.is_guest_allowed) continue;

                        var height = stream.height || 0;
                        var quality = serverName + " - " + height + "p";

                        videos.push({
                            url: streamUrl,
                            originalUrl: streamUrl,
                            quality: quality,
                            headers: {
                                "Referer": this.baseUrl + "/",
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                            }
                        });
                    } catch (se) {
                        console.log("Stream parse error: " + se);
                    }
                }
            }

            // Sort: preferred quality first, then by resolution descending
            var prefQuality = this.getPreferredQuality();
            videos.sort(function(a, b) {
                var aPref = a.quality.includes(prefQuality) ? 1 : 0;
                var bPref = b.quality.includes(prefQuality) ? 1 : 0;
                if (aPref !== bPref) return bPref - aPref;
                var qa = parseInt(a.quality.match(/(\d+)p/) ? a.quality.match(/(\d+)p/)[1] : "0") || 0;
                var qb = parseInt(b.quality.match(/(\d+)p/) ? b.quality.match(/(\d+)p/)[1] : "0") || 0;
                return qb - qa;
            });

            console.log("Total videos: " + videos.length);
            return videos;
        } catch (e) {
            console.log("getVideoList error: " + e);
            return [];
        }
    }

    async getPageList(url) {
        return [];
    }

    getFilterList() {
        return [];
    }

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
                key: "popular_sort",
                listPreference: {
                    title: "Popular Sort By",
                    summary: "How to sort the Popular tab",
                    valueIndex: 0,
                    entries: ["Most Viewed", "Most Liked"],
                    entryValues: ["views", "likes"]
                }
            },
            {
                key: "page_size",
                listPreference: {
                    title: "Videos Per Page",
                    summary: "Number of videos to show per page",
                    valueIndex: 1,
                    entries: ["16", "32", "48", "64"],
                    entryValues: ["16", "32", "48", "64"]
                }
            }
        ];
    }
}



