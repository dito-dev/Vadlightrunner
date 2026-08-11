const mangayomiSources = [{
    "name": "AnimoTVSlash",
    "lang": "en",
    "baseUrl": "https://animotvslash.org",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=animotvslash.org",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.1.2",
    "versionComment": "Fix episode list parsing for movies/series, remove strict slug filtering, and append HLS extension to Rumble cloud streams for media player compatibility.",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/animotvslash.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 619273840,
    "notes": "AnimoTVSlash - Multi-server anime streaming",
    "pkgPath": "working/animotvslash.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://animotvslash.org";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        };
    }

    // ── Base64 decoder (Mangayomi has no native atob) ─────────────────────────
    decodeBase64(b64) {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var output = "";
        var buffer = 0, bufLen = 0;
        for (var i = 0; i < b64.length; i++) {
            var c = chars.indexOf(b64.charAt(i));
            if (c < 0) continue;
            buffer = (buffer << 6) | c;
            bufLen += 6;
            if (bufLen >= 8) {
                bufLen -= 8;
                output += String.fromCharCode((buffer >> bufLen) & 0xFF);
            }
        }
        return output;
    }

    // ── Parse anime cards from listing/browse/search HTML ─────────────────────
    parseAnimeList(html) {
        var list = [];
        var seen = new Set();

        // Parse articles (homepage cards)
        var articleRx = /<article[^>]+class="[^"]*\bbs\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
        var am;
        while ((am = articleRx.exec(html)) !== null) {
            var inner = am[1];
            var slug = "";

            // Pattern 1: /{slug}-episode-{N}/
            var epM = inner.match(/href=['"]https?:\/\/animotvslash\.org\/([^'"\/]+?)-episode-\d+[^'"]*?['"]/i);
            if (epM) slug = epM[1];

            // Pattern 2: /anime/{slug}/ (search/browse results)
            if (!slug) {
                var animeM = inner.match(/href=['"]https?:\/\/animotvslash\.org\/anime\/([^'"\/]+)\/['"]/i);
                if (animeM) slug = animeM[1];
            }

            if (!slug || seen.has(slug)) continue;
            seen.add(slug);

            // Image
            var imgM2 = inner.match(/<img[^>]+(?:src|data-src|data-lazy-src)=['"]([^'"]+)['"]/i);
            var imageUrl = imgM2 ? imgM2[1].trim() : "";
            if (imageUrl && !imageUrl.startsWith("http")) imageUrl = "";

            // Title
            var ttM = inner.match(/class=["'][^"']*\btt\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|h2|h3)>/i);
            var name = "";
            if (ttM) name = ttM[1].replace(/<[^>]+>/g, "").trim();
            if (!name) {
                var altM = inner.match(/alt=['"]([^'"]+?)(?:\s+Episode\s+\d+)?\s*['"]/i);
                if (altM) name = altM[1].trim();
            }
            if (!name) continue;

            list.push({ name, imageUrl, link: "/anime/" + slug + "/" });
        }

        // Also parse browse page cards (div.bs with different structure)
        if (list.length === 0) {
            var bsRx = /<div[^>]+class="[^"]*\bbsx\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
            while ((am = bsRx.exec(html)) !== null) {
                var inner = am[1];
                var linkM = inner.match(/href=['"]https?:\/\/animotvslash\.org\/anime\/([^'"\/]+)\/['"]/i);
                if (!linkM) continue;
                var slug = linkM[1];
                if (seen.has(slug)) continue;
                seen.add(slug);

                var imgM = inner.match(/<img[^>]+(?:src|data-src|data-lazy-src)=['"]([^'"]+)['"]/i);
                var imageUrl = imgM ? imgM[1].trim() : "";
                if (imageUrl && !imageUrl.startsWith("http")) imageUrl = "";

                var titleM = inner.match(/title=['"]([^'"]+)['"]/i);
                var name = titleM ? titleM[1].trim() : "";
                if (!name) {
                    var altM = inner.match(/alt=['"]([^'"]+)['"]/i);
                    if (altM) name = altM[1].trim();
                }
                if (!name) continue;

                list.push({ name, imageUrl, link: "/anime/" + slug + "/" });
            }
        }

        return list;
    }

    async fetchListing(url) {
        try {
            console.log("AnimoTVSlash fetch: " + url);
            var res = await this.client.get(url, this.getHeaders());
            if (res.statusCode !== 200) return { list: [], hasNextPage: false };
            var list = this.parseAnimeList(res.body);
            // Check for next page link
            var hasNextPage = /<a[^>]+class="[^"]*\bnext\b[^"]*"[^>]*>/i.test(res.body) ||
                              /href=['"]https?:\/\/animotvslash\.org[^'"]*page\/\d+\/?['"]/i.test(res.body);
            return { list, hasNextPage };
        } catch(e) {
            console.log("AnimoTVSlash fetch error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getPopular(page) {
        // Use the anime archive page sorted by popularity
        var url = this.baseUrl + "/anime/?status=&type=&order=popular&page=" + page;
        return await this.fetchListing(url);
    }

    async getLatestUpdates(page) {
        // Use the anime archive page sorted by latest update
        var url = this.baseUrl + "/anime/?status=&type=&order=update&page=" + page;
        return await this.fetchListing(url);
    }

    async search(query, page, filters) {
        var url = "";

        // Check if genre filter is applied
        var genreSlug = "";
        var statusVal = "";
        var typeVal = "";
        var orderVal = "";

        if (filters && Array.isArray(filters)) {
            for (var f of filters) {
                if (f.type === "GenreFilter" && f.state && f.state.length > 0) {
                    genreSlug = f.state;
                }
                if (f.type === "StatusFilter" && f.state) {
                    statusVal = f.state;
                }
                if (f.type === "TypeFilter" && f.state) {
                    typeVal = f.state;
                }
                if (f.type === "SortFilter" && f.state) {
                    orderVal = f.state;
                }
            }
        }

        if (query && query.length > 0) {
            // Text search
            url = this.baseUrl + "/?s=" + encodeURIComponent(query);
            if (page > 1) url += "&paged=" + page;
        } else if (genreSlug) {
            // Genre browsing
            url = this.baseUrl + "/genres/" + genreSlug + "/";
            if (page > 1) url += "page/" + page + "/";
        } else {
            // Filter-based browsing
            url = this.baseUrl + "/anime/?status=" + (statusVal || "") +
                  "&type=" + (typeVal || "") +
                  "&order=" + (orderVal || "update") +
                  "&page=" + page;
        }

        return await this.fetchListing(url);
    }

    // ── getDetail ──────────────────────────────────────────────────────────────
    async getDetail(url) {
        var detailUrl = url.startsWith("http") ? url
                      : url.startsWith("/")    ? this.baseUrl + url
                      : this.baseUrl + "/anime/" + url + "/";

        var name = "", imageUrl = "", description = "", genre = [], status = 5, chapters = [];

        try {
            var res = await this.client.get(detailUrl, this.getHeaders());
            var html = res.body;

            // Title
            var t = html.match(/meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
            if (t) name = t[1].replace(/\s*[-|].*?(ANIMOTVSLASH|animotvslash)[^\n]*/i, "").trim();

            // Cover image
            var img = html.match(/meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
            if (img) imageUrl = img[1];

            // Description - try synp block first, then meta
            var synpM = html.match(/class=["'][^"']*\bentry-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
            if (synpM) {
                description = synpM[1].replace(/<[^>]+>/g, "").trim();
            }
            if (!description || description.length < 10) {
                var desc = html.match(/meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)["']/i);
                if (desc) description = desc[1].trim();
            }

            // Genres
            var gm, genreRx = /href=["'][^"']*\/genre\/([^"'\/]+)[^"']*["'][^>]*>([^<]+)</gi;
            while ((gm = genreRx.exec(html)) !== null) {
                var g = gm[2].trim();
                if (g && !genre.includes(g)) genre.push(g);
            }

            // Status
            var statusM = html.match(/Status\s*<\/span>\s*([^<]+)/i);
            if (statusM) {
                var st = statusM[1].trim().toLowerCase();
                if (st.includes("completed") || st.includes("finished")) status = 1;
                else if (st.includes("ongoing") || st.includes("airing")) status = 0;
                else if (st.includes("upcoming")) status = 4;
                else if (st.includes("hiatus")) status = 2;
            } else {
                if (/completed|finished/i.test(html)) status = 1;
                else if (/ongoing|airing/i.test(html)) status = 0;
            }

            // Slice the eplister container block
            var eplistIdx = html.search(/class=["'][^"']*eplister[^"']*["']/i);
            if (eplistIdx !== -1) {
                var tempBlock = html.slice(eplistIdx);
                var endUlIdx = tempBlock.indexOf("</ul>");
                var epBlock = endUlIdx !== -1 ? tempBlock.slice(0, endUlIdx + 5) : tempBlock;

                var epRx = /<a[^>]+href=["'](https?:\/\/animotvslash\.org\/([^"' >]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
                var em, seenUrls = new Set();
                while ((em = epRx.exec(epBlock)) !== null) {
                    var epHref = em[1];
                    var inner = em[3];
                    if (seenUrls.has(epHref)) continue;
                    seenUrls.add(epHref);

                    var numM = inner.match(/class=["']epl-num["'][^>]*>([^<]+)/i);
                    var epLabel = numM ? numM[1].trim() : "";

                    var chName = "Episode " + epLabel;
                    if (epLabel.toLowerCase().includes("movie")) {
                        chName = "Movie";
                    } else if (epLabel.toLowerCase().includes("special")) {
                        chName = "Special";
                    } else if (!epLabel) {
                        chName = "Episode " + (chapters.length + 1);
                    }

                    chapters.push({ name: chName, url: epHref });
                }
            } else {
                // Movie or single watch page (e.g. no episode list container)
                // Look for watchnow-btn link
                var watchNowM = html.match(/class=["']watchnow-btn["'][^>]*href=["']([^"']+)["']/i) || 
                                html.match(/href=["']([^"']+)["'][^>]*class=["']watchnow-btn["']/i);
                if (watchNowM) {
                    var movieUrl = watchNowM[1];
                    if (movieUrl.startsWith("//")) movieUrl = "https:" + movieUrl;
                    chapters.push({ name: "Movie", url: movieUrl });
                }
            }

            // Fallback: if eplister is empty, guess Episode 1
            if (chapters.length === 0) {
                var slugM = detailUrl.match(/\/anime\/([^\/]+)\//);
                if (slugM) {
                    chapters.push({ name: "Episode 1", url: this.baseUrl + "/" + slugM[1] + "-episode-1/" });
                }
            }

            // Sort DESCENDING (newest first)
            chapters.sort(function(a, b) {
                var na = parseInt((a.url.match(/-episode-(\d+)/) || [0, 0])[1]);
                var nb = parseInt((b.url.match(/-episode-(\d+)/) || [0, 0])[1]);
                return nb - na;
            });

        } catch(e) { console.log("AnimoTVSlash getDetail error: " + e); }

        return { name, imageUrl, description, genre, status, chapters };
    }

    // ── getVideoList ───────────────────────────────────────────────────────────
    // Supports ALL servers: ANIMO-M (Rumble HLS), Kazumi, Animo, Moon, Hydrax, Vidhide, Vidara
    async getVideoList(url) {
        var videos = [];
        var preferredServer = new SharedPreferences().get("preferred_server") || "all";

        try {
            var epUrl = url.startsWith("http") ? url : this.baseUrl + url;
            console.log("AnimoTVSlash getVideoList: " + epUrl);
            var res = await this.client.get(epUrl, this.getHeaders());
            var html = res.body;

            // Find the mirror <select>
            var selectM = html.match(/<select class=["']mirror["'][\s\S]*?<\/select>/i);
            if (!selectM) {
                console.log("AnimoTVSlash: mirror select not found");
                return videos;
            }

            var optionRx = /<option value=["']([^"']+)["'][^>]*>\s*([^<]+)\s*<\/option>/gi;
            var om;
            while ((om = optionRx.exec(selectM[0])) !== null) {
                var rawLabel = om[2].trim();
                if (rawLabel.toLowerCase().includes("select")) continue;

                // Parse label: "Sub - ANIMO-M", "SoftSub - Moon", etc.
                var typeMatch = rawLabel.match(/(Sub|SoftSub|Dub)/i);
                var dataType = typeMatch ? typeMatch[1] : "Sub";

                var serverName = rawLabel.replace(/(Sub|SoftSub|Dub)\s*-\s*/i, "").trim();

                // If user selected a specific server preference, filter
                if (preferredServer !== "all" && serverName.toLowerCase() !== preferredServer.toLowerCase()) continue;

                var quality = serverName + " (" + dataType + ")";

                // Decode the base64 option value → iframe HTML
                var decodedHtml = "";
                try {
                    decodedHtml = this.decodeBase64(om[1]);
                } catch(e) {
                    console.log("AnimoTVSlash: base64 decode error for " + serverName);
                    continue;
                }

                var iframeM = decodedHtml.match(/src=["']([^"']+)["']/i);
                if (!iframeM) continue;

                var streamUrl = iframeM[1];

                // ── ANIMO-M: jw-player/Rumble HLS extraction ──────────────────
                if (streamUrl.includes("/jw-player/")) {
                    var jwIdM = streamUrl.match(/\/jw-player\/([A-Za-z0-9+\/=\-_]+)/);
                    if (jwIdM) {
                        try {
                            var rawB64 = jwIdM[1].replace(/-/g, "+").replace(/_/g, "/");
                            var jwDecoded = this.decodeBase64(rawB64);
                            var jwData = JSON.parse(jwDecoded);
                            var masterUrl = jwData.url || "";
                            if (masterUrl.startsWith("//")) masterUrl = "https:" + masterUrl;

                            if (masterUrl) {
                                var rumbleHeaders = {
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                    "Referer": this.baseUrl + "/",
                                    "Origin": this.baseUrl
                                };
                                var masterRes = await this.client.get(masterUrl, rumbleHeaders);
                                if (masterRes.statusCode === 200) {
                                    var lines = masterRes.body.split("\n");
                                    var qualityMap = {
                                        "1920x1080": "1080p", "1280x720": "720p",
                                        "854x480": "480p", "640x360": "360p"
                                    };
                                    var pushedRumble = false;
                                    for (var i = 0; i < lines.length; i++) {
                                        var line = lines[i].trim();
                                        if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
                                        var resM = line.match(/RESOLUTION=([\dx]+)/i);
                                        var q = resM ? (qualityMap[resM[1]] || resM[1]) : "Default";
                                        var sUrl = "";
                                        for (var j = i + 1; j < lines.length; j++) {
                                            var nL = lines[j].trim();
                                            if (nL && !nL.startsWith("#")) { sUrl = nL; break; }
                                        }
                                        if (!sUrl) continue;
                                        if (sUrl.startsWith("//")) sUrl = "https:" + sUrl;
                                        if (!sUrl.startsWith("http")) {
                                            var base = masterUrl.slice(0, masterUrl.lastIndexOf("/") + 1);
                                            sUrl = base + sUrl;
                                        }
                                        var finalStreamUrl = sUrl + (sUrl.includes("?") ? "&" : "?") + "ext=.m3u8";
                                        videos.push({
                                            url: finalStreamUrl,
                                            originalUrl: sUrl,
                                            quality: quality + " - " + q,
                                            headers: { "Referer": this.baseUrl + "/" }
                                        });
                                        pushedRumble = true;
                                    }
                                    if (pushedRumble) continue;
                                }
                            }
                        } catch(e) {
                            console.log("AnimoTVSlash: jw-player parse error: " + e);
                        }
                    }
                }

                // ── ANIMO-H: plyr-player HLS extraction ──────────────────
                if (streamUrl.includes("/plyr-player/")) {
                    var plyrIdM = streamUrl.match(/\/plyr-player\/([A-Za-z0-9+\/=\-_]+)/);
                    if (plyrIdM) {
                        try {
                            var rawB64 = plyrIdM[1].replace(/-/g, "+").replace(/_/g, "/");
                            var plyrDecoded = this.decodeBase64(rawB64);
                            var plyrData = JSON.parse(plyrDecoded);
                            var playlistUrl = plyrData.url || "";
                            if (playlistUrl) {
                                if (playlistUrl.startsWith("//")) playlistUrl = "https:" + playlistUrl;
                                videos.push({
                                    url: playlistUrl,
                                    originalUrl: playlistUrl,
                                    quality: quality + " - HLS",
                                    headers: { "Referer": streamUrl }
                                });
                                continue;
                            }
                        } catch(e) {
                            console.log("AnimoTVSlash: plyr-player parse error: " + e);
                        }
                    }
                }

                // ── ANIMO-D: vidstack-player extraction ──────────────────
                if (streamUrl.includes("/vidstack-player/")) {
                    var vdsIdM = streamUrl.match(/\/vidstack-player\/([A-Za-z0-9+\/=\-_]+)/);
                    if (vdsIdM) {
                        try {
                            var rawB64 = vdsIdM[1].replace(/-/g, "+").replace(/_/g, "/");
                            var vdsDecoded = this.decodeBase64(rawB64);
                            var vdsData = JSON.parse(vdsDecoded);
                            var addedVds = false;
                            var qualities = [
                                { key: "url_1080", name: "1080p" },
                                { key: "url_720", name: "720p" },
                                { key: "url_480", name: "480p" },
                                { key: "url_360", name: "360p" },
                                { key: "url", name: "Default" }
                            ];
                            for (var i = 0; i < qualities.length; i++) {
                                var q = qualities[i];
                                var sUrl = vdsData[q.key] || "";
                                if (sUrl) {
                                    if (sUrl.startsWith("//")) sUrl = "https:" + sUrl;
                                    videos.push({
                                        url: sUrl,
                                        originalUrl: sUrl,
                                        quality: quality + " - " + q.name,
                                        headers: { "Referer": streamUrl }
                                    });
                                    addedVds = true;
                                }
                            }
                            if (addedVds) continue;
                        } catch(e) {
                            console.log("AnimoTVSlash: vidstack-player parse error: " + e);
                        }
                    }
                }

                // ── Kazumi: apdm-embed extraction ─────────────────────────────
                if (streamUrl.includes("/apdm-embed/")) {
                    try {
                        var apdmRes = await this.client.get(streamUrl, {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                            "Referer": this.baseUrl + "/"
                        });
                        if (apdmRes.statusCode === 200) {
                            // Look for m3u8 or direct video URL in the embed page
                            var m3u8M = apdmRes.body.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*?)["']/i);
                            if (m3u8M) {
                                videos.push({
                                    url: m3u8M[1],
                                    originalUrl: m3u8M[1],
                                    quality: quality + " - HLS",
                                    headers: { "Referer": streamUrl }
                                });
                                continue;
                            }
                            var mp4M = apdmRes.body.match(/["'](https?:\/\/[^"']+\.mp4[^"']*?)["']/i);
                            if (mp4M) {
                                videos.push({
                                    url: mp4M[1],
                                    originalUrl: mp4M[1],
                                    quality: quality + " - MP4",
                                    headers: { "Referer": streamUrl }
                                });
                                continue;
                            }
                        }
                    } catch(e) {
                        console.log("AnimoTVSlash: Kazumi extraction error: " + e);
                    }
                }

                // ── Fallback: push iframe URL directly ────────────────────────
                // Works for: Moon (bysezoxexe.com), Hydrax (abyssplayer.com),
                // Vidhide (minochinos.com), Vidara (vidara.to), Animo (p2pplay.pro)
                if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;
                videos.push({
                    url: streamUrl,
                    originalUrl: streamUrl,
                    quality: quality,
                    headers: { "Referer": this.baseUrl + "/" }
                });
            }

        } catch(e) { console.log("AnimoTVSlash getVideoList error: " + e); }

        return videos;
    }

    async getPageList(url) { return []; }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                type: "GenreFilter",
                name: "Genre",
                state: 0,
                values: [
                    { type_name: "SelectOption", value: "", name: "All" },
                    { type_name: "SelectOption", value: "action", name: "Action" },
                    { type_name: "SelectOption", value: "adventure", name: "Adventure" },
                    { type_name: "SelectOption", value: "comedy", name: "Comedy" },
                    { type_name: "SelectOption", value: "drama", name: "Drama" },
                    { type_name: "SelectOption", value: "ecchi", name: "Ecchi" },
                    { type_name: "SelectOption", value: "fantasy", name: "Fantasy" },
                    { type_name: "SelectOption", value: "harem", name: "Harem" },
                    { type_name: "SelectOption", value: "historical", name: "Historical" },
                    { type_name: "SelectOption", value: "horror", name: "Horror" },
                    { type_name: "SelectOption", value: "isekai", name: "Isekai" },
                    { type_name: "SelectOption", value: "martial-arts", name: "Martial Arts" },
                    { type_name: "SelectOption", value: "mecha", name: "Mecha" },
                    { type_name: "SelectOption", value: "music", name: "Music" },
                    { type_name: "SelectOption", value: "mystery", name: "Mystery" },
                    { type_name: "SelectOption", value: "psychological", name: "Psychological" },
                    { type_name: "SelectOption", value: "romance", name: "Romance" },
                    { type_name: "SelectOption", value: "school", name: "School" },
                    { type_name: "SelectOption", value: "sci-fi", name: "Sci-Fi" },
                    { type_name: "SelectOption", value: "seinen", name: "Seinen" },
                    { type_name: "SelectOption", value: "shoujo", name: "Shoujo" },
                    { type_name: "SelectOption", value: "shounen", name: "Shounen" },
                    { type_name: "SelectOption", value: "slice-of-life", name: "Slice of Life" },
                    { type_name: "SelectOption", value: "sports", name: "Sports" },
                    { type_name: "SelectOption", value: "super-power", name: "Super Power" },
                    { type_name: "SelectOption", value: "supernatural", name: "Supernatural" },
                    { type_name: "SelectOption", value: "thriller", name: "Thriller" }
                ]
            },
            {
                type_name: "SelectFilter",
                type: "StatusFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", value: "", name: "All" },
                    { type_name: "SelectOption", value: "Ongoing", name: "Ongoing" },
                    { type_name: "SelectOption", value: "Completed", name: "Completed" },
                    { type_name: "SelectOption", value: "Upcoming", name: "Upcoming" },
                    { type_name: "SelectOption", value: "Hiatus", name: "Hiatus" }
                ]
            },
            {
                type_name: "SelectFilter",
                type: "TypeFilter",
                name: "Type",
                state: 0,
                values: [
                    { type_name: "SelectOption", value: "", name: "All" },
                    { type_name: "SelectOption", value: "TV", name: "TV Series" },
                    { type_name: "SelectOption", value: "OVA", name: "OVA" },
                    { type_name: "SelectOption", value: "Movie", name: "Movie" },
                    { type_name: "SelectOption", value: "Special", name: "Special" },
                    { type_name: "SelectOption", value: "ONA", name: "ONA" }
                ]
            },
            {
                type_name: "SelectFilter",
                type: "SortFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", value: "update", name: "Latest Update" },
                    { type_name: "SelectOption", value: "popular", name: "Popular" },
                    { type_name: "SelectOption", value: "latest", name: "Latest Added" },
                    { type_name: "SelectOption", value: "title", name: "A-Z" },
                    { type_name: "SelectOption", value: "titlereverse", name: "Z-A" },
                    { type_name: "SelectOption", value: "rating", name: "Rating" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "preferred_server",
                listPreference: {
                    title: "Preferred Server",
                    summary: "Choose which video server to prioritize",
                    valueIndex: 0,
                    entries: ["All Servers", "ANIMO-M", "Kazumi", "Animo", "Moon", "Hydrax", "Vidhide", "Vidara"],
                    entryValues: ["all", "ANIMO-M", "Kazumi", "Animo", "Moon", "Hydrax", "Vidhide", "Vidara"]
                }
            }
        ];
    }
}
