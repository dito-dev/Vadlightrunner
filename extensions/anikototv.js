const mangayomiSources = [{
    "name": "AniKoto",
    "lang": "en",
    "baseUrl": "https://anikototv.to",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=anikototv.to",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.7",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": true,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/anikototv.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 561837294,
    "notes": "",
    "pkgPath": "working/anikototv.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://anikototv.to";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        };
    }

    getAjaxHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01"
        };
    }

    proxyVideoUrl(url, referer) {
        if (!url) return "";
        var workerProxy = new SharedPreferences().get("cf_worker_proxy") || "https://m3u8-cors-proxy.dito21525.workers.dev";
        var baseProxy = workerProxy.trim().replace(/\/v2\/?$/, "").replace(/\/$/, "");
        var videoHeaders = { "Referer": referer || (this.baseUrl + "/") };
        return baseProxy + "/v2?url=" + encodeURIComponent(url) + "&headers=" + encodeURIComponent(JSON.stringify(videoHeaders));
    }

    // ========================================================================
    // HTML Parsing - SSR pages contain full anime cards
    // Card structure: <a href="/watch/{slug}/ep-{n}"> <img src="{img}" alt="{title}">
    // ========================================================================
    parseAnimeList(html) {
        var list = [];
        var seen = new Set();

        // Pattern 1: <a href="/watch/{slug}..."> <img src="..." alt="title">
        var cardRegex = /<a[^>]+href=["'](?:https?:\/\/[^\/]+)?\/watch\/([^"'\/\?]+)[^"']*["'][^>]*>\s*<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']+)["']/gi;
        var m;
        while ((m = cardRegex.exec(html)) !== null) {
            var slug = m[1];
            var imageUrl = m[2];
            var title = m[3].trim();
            if (!slug || seen.has(slug)) continue;
            seen.add(slug);
            list.push({ name: title, imageUrl: imageUrl, link: slug });
        }

        // Pattern 2: class="name d-title" href="/watch/{slug}...">Title</a>
        if (list.length === 0) {
            var nameRegex = /class=["']name\s+d-title["'][^>]*href=["'](?:https?:\/\/[^\/]+)?\/watch\/([^"'\/\?]+)[^"']*["'][^>]*>([^<]+)<\/a>/gi;
            while ((m = nameRegex.exec(html)) !== null) {
                var slug = m[1];
                var title = m[2].trim();
                if (!slug || seen.has(slug) || title.length < 2) continue;
                seen.add(slug);
                list.push({ name: title, imageUrl: "", link: slug });
            }
        }

        // Pattern 3: generic /watch/ links with text
        if (list.length === 0) {
            var textRegex = /href=["'](?:https?:\/\/[^\/]+)?\/watch\/([^"'\/\?]+)(?:\/[^"'\?]*)?["'][^>]*>([^<]+)<\/a>/gi;
            while ((m = textRegex.exec(html)) !== null) {
                var slug = m[1];
                var title = m[2].trim().replace(/\s+/g, " ");
                if (!slug || seen.has(slug) || title.length < 2) continue;
                seen.add(slug);
                list.push({ name: title, imageUrl: "", link: slug });
            }
        }

        // Enrich images if missing
        for (var i = 0; i < list.length; i++) {
            if (!list[i].imageUrl) {
                var re = new RegExp(list[i].link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[\\s\\S]{0,400}?<img[^>]+(?:data-src|src)=[\"']([^\"']+)[\"']", "i");
                var imgM = html.match(re);
                if (imgM) list[i].imageUrl = imgM[1];
            }
        }
        return list;
    }

    async fetchListing(url) {
        try {
            var res = await this.client.get(url, this.getHeaders());
            if (res.statusCode !== 200) return { list: [], hasNextPage: false };
            var html = res.body;
            var list = this.parseAnimeList(html);
            var hasNextPage = /[?&]page=\d+/.test(html) && /class=["'][^"']*pagination/.test(html);
            return { list: list, hasNextPage: hasNextPage };
        } catch (e) {
            console.log("AniKoto fetchListing error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getPopular(page) {
        return await this.fetchListing(this.baseUrl + "/most-viewed" + (page > 1 ? "?page=" + page : ""));
    }

    async getLatestUpdates(page) {
        return await this.fetchListing(this.baseUrl + "/latest-updated" + (page > 1 ? "?page=" + page : ""));
    }

    async search(query, page, filters) {
        return await this.fetchListing(this.baseUrl + "/filter?keyword=" + encodeURIComponent(query) + (page > 1 ? "&page=" + page : ""));
    }

    // ========================================================================
    // getDetail - fetch anime info + episode list via AJAX
    // ========================================================================
    async getDetail(url) {
        var slug = url;
        var name = slug.replace(/-[a-z0-9]{5}$/, "").replace(/-/g, " ");
        var imageUrl = "", description = "", genre = [], status = 5, chapters = [];

        try {
            // Fetch the watch page to get anime ID and metadata
            var pageRes = await this.client.get(this.baseUrl + "/watch/" + slug, this.getHeaders());
            if (pageRes.statusCode !== 200) {
                // Try with /ep-1
                pageRes = await this.client.get(this.baseUrl + "/watch/" + slug + "/ep-1", this.getHeaders());
            }

            if (pageRes.statusCode === 200) {
                var html = pageRes.body;

                // Extract title
                var titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                    || html.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch) {
                    name = titleMatch[1]
                        .replace(/\s*Episode\s*\d+.*$/i, "")
                        .replace(/\s*-\s*Anikoto.*$/i, "")
                        .replace(/^Anime\s+/i, "")
                        .replace(/\s*Watch Online Free\s*$/i, "")
                        .trim();
                }

                // Extract image
                var imgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
                if (imgMatch) imageUrl = imgMatch[1];

                // Extract description
                var descMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
                    || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
                if (descMatch) description = descMatch[1].trim();

                // Extract genres
                var genreRegex = /href=["']\/genre\/([^"'\/]+)["'][^>]*>([^<]+)</gi;
                var gm, genreSet = new Set();
                while ((gm = genreRegex.exec(html)) !== null) {
                    var g = gm[2].trim();
                    if (g && !genreSet.has(g)) { genreSet.add(g); genre.push(g); }
                }

                // Extract status
                if (/finished.airing|completed/i.test(html)) status = 1;
                else if (/currently.airing|ongoing/i.test(html)) status = 0;
                else if (/not.yet.aired/i.test(html)) status = 2;

                // Extract anime ID from data-id or data-tip
                var dataIdMatch = html.match(/data-id=["'](\d+)["']/);
                if (!dataIdMatch) dataIdMatch = html.match(/data-tip=["'](\d+)["']/);

                if (dataIdMatch) {
                    var animeId = dataIdMatch[1];

                    // Fetch episode list via AJAX
                    var listRes = await this.client.get(
                        this.baseUrl + "/ajax/episode/list/" + animeId + "?vrf=",
                        this.getAjaxHeaders()
                    );

                    if (listRes.statusCode === 200) {
                        var listData;
                        try { listData = JSON.parse(listRes.body).result; } catch (e) { listData = listRes.body; }

                        // Parse episodes - data-num and data-ids can appear in either order
                        var epSeenNums = new Set();
                        // Try: data-num before data-ids
                        var epRegex1 = /data-num=["'](\d+)["'][^>]*data-ids=["']([^"']+)["']/gi;
                        var em;
                        while ((em = epRegex1.exec(listData)) !== null) {
                            var epNum = parseInt(em[1], 10);
                            if (!epSeenNums.has(epNum)) {
                                epSeenNums.add(epNum);
                                chapters.push({ name: "Episode " + epNum, url: slug + "||" + epNum + "||" + em[2] });
                            }
                        }
                        // Fallback: data-ids before data-num
                        if (chapters.length === 0) {
                            var epRegex2 = /data-ids=["']([^"']+)["'][^>]*data-num=["'](\d+)["']/gi;
                            while ((em = epRegex2.exec(listData)) !== null) {
                                var epNum2 = parseInt(em[2], 10);
                                if (!epSeenNums.has(epNum2)) {
                                    epSeenNums.add(epNum2);
                                    chapters.push({ name: "Episode " + epNum2, url: slug + "||" + epNum2 + "||" + em[1] });
                                }
                            }
                        }
                    }
                }
            }

            if (chapters.length === 0) {
                chapters.push({ name: "Episode 1", url: slug + "||1||" });
            }

            chapters.sort(function (a, b) {
                return parseInt((b.url.split("||")[1] || "0"), 10) - parseInt((a.url.split("||")[1] || "0"), 10);
            });
        } catch (e) {
            console.log("AniKoto getDetail error: " + e);
        }
        return { name: name, imageUrl: imageUrl, description: description, genre: genre, status: status, chapters: chapters };
    }

    // ========================================================================
    // getVideoList - AJAX chain to resolve streaming sources
    // Verified chain:
    //   1. /ajax/server/list?servers={dataIds} → server HTML with data-link-id
    //   2. /ajax/server?get={linkId} → embed URL (e.g. megaplay.buzz/stream/s-2/131394/sub)
    //   3. Fetch embed page HTML → extract data-id (e.g. "2649") — this is NOT the path ID!
    //   4. {host}/stream/getSources?id={data-id} → {sources: {file: "...m3u8"}, tracks: [...]}
    // ========================================================================
    async getVideoList(url) {
        var parts = url.split("||");
        var slug = parts[0];
        var epNum = parts[1] || "1";
        var cachedDataIds = parts[2] || "";

        try {
            var dataIds = cachedDataIds;

            // Step 0: Resolve dataIds if not cached
            if (!dataIds) {
                var epUrl = this.baseUrl + "/watch/" + slug + "/ep-" + epNum;
                var res = await this.client.get(epUrl, this.getHeaders());
                if (res.statusCode !== 200) return [];
                var html = res.body;
                var dataIdMatch = html.match(/data-id=["'](\d+)["']/);
                if (!dataIdMatch) return [];
                var animeId = dataIdMatch[1];

                var epListRes = await this.client.get(
                    this.baseUrl + "/ajax/episode/list/" + animeId + "?vrf=",
                    this.getAjaxHeaders()
                );
                if (epListRes.statusCode !== 200) return [];
                var listData;
                try { listData = JSON.parse(epListRes.body).result; } catch (e) { listData = epListRes.body; }

                var epMatch = listData.match(new RegExp('data-num=["\']' + epNum + '["\'][^>]*data-ids=["\']([^"\']+)["\']', 'i'));
                if (!epMatch) epMatch = listData.match(new RegExp('data-ids=["\']([^"\']+)["\'][^>]*data-num=["\']' + epNum + '["\']', 'i'));
                if (!epMatch) return [];
                dataIds = epMatch[1];
            }

            // Step 1: Get server list
            var serverListRes = await this.client.get(
                this.baseUrl + "/ajax/server/list?servers=" + encodeURIComponent(dataIds),
                this.getAjaxHeaders()
            );
            if (serverListRes.statusCode !== 200) return [];

            var serverHtml;
            try { serverHtml = JSON.parse(serverListRes.body).result; } catch (e) { serverHtml = serverListRes.body; }

            // Parse servers with their type (sub/dub) and link-id
            var servers = [];
            var typeBlocks = serverHtml.split(/data-type=["']/);
            for (var tb = 1; tb < typeBlocks.length; tb++) {
                var typeMatch = typeBlocks[tb].match(/^([^"']+)["']/);
                var audioType = typeMatch ? typeMatch[1].toUpperCase() : "";
                var liRegex = /data-link-id=["']([^"']+)["'][^>]*>([^<]+)<\/li>/gi;
                var lm;
                while ((lm = liRegex.exec(typeBlocks[tb])) !== null) {
                    servers.push({ id: lm[1], name: lm[2].trim(), type: audioType });
                }
            }
            if (servers.length === 0) {
                var simpleLi = /data-link-id=["']([^"']+)["'][^>]*>([^<]+)<\/li>/gi;
                while ((lm = simpleLi.exec(serverHtml)) !== null) {
                    servers.push({ id: lm[1], name: lm[2].trim(), type: "" });
                }
            }

            var videos = [];

            for (var i = 0; i < servers.length; i++) {
                var s = servers[i];
                try {
                    // Step 2: Get embed URL from /ajax/server
                    var serverRes = await this.client.get(
                        this.baseUrl + "/ajax/server?get=" + s.id,
                        this.getAjaxHeaders()
                    );
                    if (serverRes.statusCode !== 200) continue;
                    var serverData = JSON.parse(serverRes.body);
                    if (!serverData.result || !serverData.result.url) continue;
                    var embedUrl = serverData.result.url;

                    var label = s.name + (s.type ? " [" + s.type + "]" : "");
                    var hostMatch = embedUrl.match(/^(https?:\/\/[^\/]+)/);
                    if (!hostMatch) {
                        videos.push({ url: embedUrl, originalUrl: embedUrl, quality: "Embed - " + label, headers: { "Referer": this.baseUrl + "/" } });
                        continue;
                    }
                    var hostBase = hostMatch[1];

                    // Step 3: Fetch the embed page HTML to extract the REAL source ID
                    // The path ID (e.g. 131394) is NOT the getSources ID!
                    // The embed page HTML contains data-id="2649" which IS the getSources ID.
                    var embedRes = await this.client.get(embedUrl, {
                        "Referer": this.baseUrl + "/",
                        "User-Agent": this.getHeaders()["User-Agent"]
                    });

                    if (embedRes.statusCode !== 200) {
                        videos.push({ url: embedUrl, originalUrl: embedUrl, quality: "Embed - " + label, headers: { "Referer": this.baseUrl + "/" } });
                        continue;
                    }

                    var embedHtml = embedRes.body;
                    var realIdMatch = embedHtml.match(/data-id=["'](\d+)["']/);

                    if (!realIdMatch) {
                        videos.push({ url: embedUrl, originalUrl: embedUrl, quality: "Embed - " + label, headers: { "Referer": this.baseUrl + "/" } });
                        continue;
                    }

                    var realSourceId = realIdMatch[1];

                    // Step 4: Call getSources with the REAL data-id
                    var srcHeaders = {
                        "Referer": embedUrl,
                        "X-Requested-With": "XMLHttpRequest",
                        "User-Agent": this.getHeaders()["User-Agent"],
                        "Accept": "application/json, text/javascript, */*; q=0.01"
                    };

                    var srcAdded = false;
                    var srcUrls = [
                        hostBase + "/stream/getSources?id=" + realSourceId,
                        hostBase + "/getSources?id=" + realSourceId
                    ];

                    for (var si = 0; si < srcUrls.length && !srcAdded; si++) {
                        try {
                            var srcRes = await this.client.get(srcUrls[si], srcHeaders);
                            if (srcRes.statusCode === 200) {
                                var srcData = JSON.parse(srcRes.body);

                                // Sources can be object {file:"..."} or array [{file:"..."}]
                                var sourceList = [];
                                if (srcData.sources) {
                                    if (Array.isArray(srcData.sources)) {
                                        sourceList = srcData.sources;
                                    } else if (typeof srcData.sources === "object" && srcData.sources.file) {
                                        sourceList = [srcData.sources];
                                    } else if (typeof srcData.sources === "string") {
                                        // Encrypted sources - skip
                                        continue;
                                    }
                                }
                                if (srcData.file) sourceList.push(srcData);

                                for (var sj = 0; sj < sourceList.length; sj++) {
                                    var f = sourceList[sj].file || sourceList[sj].url || "";
                                    if (f && (f.includes(".m3u8") || f.includes(".mp4"))) {
                                        // Extract subtitle tracks if available
                                        var subtitles = [];
                                        if (srcData.tracks && Array.isArray(srcData.tracks)) {
                                            for (var tk = 0; tk < srcData.tracks.length; tk++) {
                                                var track = srcData.tracks[tk];
                                                if (track.kind === "captions" && track.file) {
                                                    subtitles.push({
                                                        file: track.file,
                                                        label: track.label || "Unknown"
                                                    });
                                                }
                                            }
                                        }

                                        var videoEntry = {
                                            url: this.proxyVideoUrl(f, hostBase + "/"),
                                            originalUrl: f,
                                            quality: (sourceList[sj].label || "Auto") + " - " + label,
                                            headers: { "Referer": hostBase + "/" }
                                        };

                                        if (subtitles.length > 0) {
                                            videoEntry.subtitles = subtitles;
                                        }

                                        videos.push(videoEntry);
                                        srcAdded = true;
                                    }
                                }
                            }
                        } catch (e2) {
                            console.log("AniKoto getSources error: " + e2);
                        }
                    }

                    // Fallback: if getSources failed, try /api/source with cid token
                    if (!srcAdded) {
                        var cidM = embedHtml.match(/cid\s*:\s*'([^']+)'/i) || embedHtml.match(/cid\s*:\s*"([^"]+)"/i);
                        if (cidM) {
                            var apiUrls = [
                                hostBase + "/api/source/" + realSourceId + "?cid=" + encodeURIComponent(cidM[1]),
                                hostBase + "/api/v2/source/" + realSourceId + "?cid=" + encodeURIComponent(cidM[1])
                            ];
                            for (var ai = 0; ai < apiUrls.length && !srcAdded; ai++) {
                                try {
                                    var apiRes = await this.client.get(apiUrls[ai], srcHeaders);
                                    if (apiRes.statusCode === 200) {
                                        var apiData = JSON.parse(apiRes.body);
                                        var apiSrc = [];
                                        if (apiData.sources) {
                                            if (Array.isArray(apiData.sources)) apiSrc = apiData.sources;
                                            else if (typeof apiData.sources === "object" && apiData.sources.file) apiSrc = [apiData.sources];
                                        }
                                        for (var ak = 0; ak < apiSrc.length; ak++) {
                                            var af = apiSrc[ak].file || apiSrc[ak].url || "";
                                            if (af && (af.includes(".m3u8") || af.includes(".mp4"))) {
                                                videos.push({
                                                    url: this.proxyVideoUrl(af, hostBase + "/"), originalUrl: af,
                                                    quality: (apiSrc[ak].label || "Auto") + " - " + label,
                                                    headers: { "Referer": hostBase + "/" }
                                                });
                                                srcAdded = true;
                                            }
                                        }
                                    }
                                } catch (e3) { /* skip */ }
                            }
                        }
                    }

                    if (!srcAdded) {
                        videos.push({ url: embedUrl, originalUrl: embedUrl, quality: "Embed - " + label, headers: { "Referer": this.baseUrl + "/" } });
                    }
                } catch (err) {
                    console.log("AniKoto server " + s.name + " error: " + err);
                }
            }

            return videos;
        } catch (e) {
            console.log("AniKoto getVideoList error: " + e);
            return [];
        }
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Type",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Movie", value: "1" },
                    { type_name: "SelectOption", name: "TV", value: "2" },
                    { type_name: "SelectOption", name: "OVA", value: "3" },
                    { type_name: "SelectOption", name: "ONA", value: "4" },
                    { type_name: "SelectOption", name: "Special", value: "5" },
                    { type_name: "SelectOption", name: "Music", value: "6" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Finished Airing", value: "1" },
                    { type_name: "SelectOption", name: "Currently Airing", value: "2" },
                    { type_name: "SelectOption", name: "Not Yet Aired", value: "3" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Sort",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Default", value: "" },
                    { type_name: "SelectOption", name: "Latest Updated", value: "recently_updated" },
                    { type_name: "SelectOption", name: "Latest Added", value: "recently_added" },
                    { type_name: "SelectOption", name: "Score", value: "score" },
                    { type_name: "SelectOption", name: "Name A-Z", value: "title_az" },
                    { type_name: "SelectOption", name: "Most Viewed", value: "most_watched" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "stream_type",
                listPreference: {
                    title: "Preferred Audio",
                    summary: "Prefer subtitled or dubbed streams",
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
            }
        ];
    }
}
