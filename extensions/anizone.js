const mangayomiSources = [{
    "name": "AniZone",
    "lang": "en",
    "baseUrl": "https://anizone.to",
    "apiUrl": "",
    "iconUrl": "https://anizone.to/apple-touch-icon.png",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/anizone.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 807164808,
    "notes": "AniZone anime extension.",
    "pkgPath": "working/anizone.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://anizone.to";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Referer": "https://anizone.to/"
        };
    }

    getStreamHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://anizone.to/"
        };
    }

    // ── Helper: Parse item cards from an HTML listing page ──
    parseListingPage(html) {
        var doc = new Document(html);
        var list = [];
        var cards = doc.select("[x-data]");

        for (var el of cards) {
            var xData = el.attr("x-data") || "";
            var linkEl = el.selectFirst("a[href*=\"/anime/\"]");
            if (!linkEl) continue;

            var href = linkEl.attr("href") || "";
            if (!href || !href.match(/\/anime\/[a-z0-9\-_]+$/i)) continue;

            var title = "";
            var titleMatch = xData.match(/window\.getTitle\s*\([^,]+,\s*['"](.*?)['"]\s*\)/s);
            if (titleMatch) {
                title = titleMatch[1].replace(/\\"/g, '"').replace(/^"/, '').replace(/"$/, '').trim();
            }
            if (!title) {
                title = linkEl.text.trim();
            }

            var imgEl = el.selectFirst("img");
            var img = imgEl ? (imgEl.attr("src") || imgEl.attr("data-src") || "") : "";

            var fullUrl = href.startsWith("http") ? href : this.baseUrl + href;
            var fullImg = img && img.startsWith("http") ? img : (img ? this.baseUrl + img : "");

            if (list.findIndex(x => x.link === fullUrl) === -1) {
                list.push({
                    name: title,
                    imageUrl: fullImg,
                    link: fullUrl
                });
            }
        }

        return list;
    }

    async getPopular(page) {
        var url = this.baseUrl + "/anime?page=" + page;
        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        var doc = new Document(res.body);
        var hasNextPage = doc.selectFirst("a[rel=\"next\"], a:contains(\"Next\"), [wire\\:click*=\"nextPage\"]") !== null || list.length >= 24;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getLatestUpdates(page) {
        var url = this.baseUrl + "/anime?page=" + page;
        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        var doc = new Document(res.body);
        var hasNextPage = doc.selectFirst("a[rel=\"next\"], a:contains(\"Next\"), [wire\\:click*=\"nextPage\"]") !== null || list.length >= 24;

        return { list: list, hasNextPage: hasNextPage };
    }

    async search(query, page, filters) {
        var url = this.baseUrl + "/anime?search=" + encodeURIComponent(query) + "&page=" + page;

        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        var doc = new Document(res.body);
        var hasNextPage = doc.selectFirst("a[rel=\"next\"], a:contains(\"Next\"), [wire\\:click*=\"nextPage\"]") !== null || list.length >= 24;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        var res = await this.client.get(url, this.getHeaders());
        var doc = new Document(res.body);

        var title = "";
        var xDataEls = doc.select("[x-data]");
        for (var xEl of xDataEls) {
            var xd = xEl.attr("x-data") || "";
            var m = xd.match(/window\.getTitle\s*\([^,]+,\s*['"](.*?)['"]\s*\)/s);
            if (m && !title) {
                title = m[1].replace(/\\"/g, '"').replace(/^"/, '').replace(/"$/, '').trim();
            }
        }

        if (!title) {
            var titleTag = doc.selectFirst("title");
            if (titleTag) {
                title = titleTag.text.replace(/\s*—\s*AniZone$/i, '').replace(/^"/, '').replace(/"$/, '').trim();
            }
        }

        var imageEl = doc.selectFirst("img[src*=\"/images/anime/\"]");
        var imageUrl = imageEl ? (imageEl.attr("src") || imageEl.attr("data-src") || "") : "";
        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = this.baseUrl + imageUrl;
        }

        var description = "";
        var synopsisHeader = doc.selectFirst("h3:contains(\"Synopsis\"), h2:contains(\"Synopsis\")");
        if (synopsisHeader) {
            var parentEl = synopsisHeader.parent;
            if (parentEl) {
                description = parentEl.text.replace(/^Synopsis/i, '').trim();
            }
        }
        if (!description) {
            var synopsisEl = doc.selectFirst(".synopsis, .description");
            if (synopsisEl) description = synopsisEl.text.trim();
        }

        var genreEls = doc.select("a[href*=\"/tag/\"]");
        var genres = [];
        for (var g of genreEls) {
            var tag = g.attr("title") || g.text.trim();
            if (tag && genres.indexOf(tag) === -1) {
                genres.push(tag);
            }
        }

        var status = 0;
        var fullText = res.body;
        if (fullText.includes("Completed")) {
            status = 1;
        } else if (fullText.includes("Ongoing")) {
            status = 0;
        }

        var epSlugMatch = url.match(/\/anime\/([a-z0-9\-_]+)/i);
        var animeSlug = epSlugMatch ? epSlugMatch[1] : "";

        var chapters = [];

        // 1. DOM element episode selection
        var epEls = doc.select("a[href*=\"/anime/\"]");
        for (var ep of epEls) {
            var href = ep.attr("href") || "";
            var fullHref = href.startsWith("http") ? href : this.baseUrl + href;

            if (animeSlug) {
                var match = fullHref.match(new RegExp("/anime/" + animeSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "/(\\d+)", "i"));
                if (match) {
                    var epNum = match[1];
                    var epName = "Episode " + epNum;

                    if (chapters.findIndex(c => c.url === fullHref) === -1) {
                        chapters.push({
                            name: epName,
                            url: fullHref
                        });
                    }
                }
            }
        }

        // 2. Raw HTML regex fallback episode search
        if (animeSlug) {
            var rawEpRegex = new RegExp("/anime/" + animeSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "/(\\d+)", "gi");
            var rawMatch;
            while ((rawMatch = rawEpRegex.exec(fullText)) !== null) {
                var fullEpHref = this.baseUrl + rawMatch[0];
                var epNum = rawMatch[1];
                if (chapters.findIndex(c => c.url === fullEpHref) === -1) {
                    chapters.push({
                        name: "Episode " + epNum,
                        url: fullEpHref
                    });
                }
            }
        }

        chapters.sort((a, b) => {
            var numA = parseInt(a.url.split('/').pop() || '0');
            var numB = parseInt(b.url.split('/').pop() || '0');
            return numA - numB;
        });

        return {
            name: title,
            imageUrl: imageUrl,
            description: description,
            genre: genres,
            status: status,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        var res = await this.client.get(url, this.getHeaders());
        var html = res.body;
        var doc = new Document(html);

        var videos = [];
        var streamHeaders = this.getStreamHeaders();

        // ── Extract Subtitles from <track> tags ──
        var subtitles = [];

        // 1. Raw HTML regex match for <track> tags (handles unquoted attributes like src=https://...)
        var trackRegex = /<track\b[^>]*>/gi;
        var match;
        while ((match = trackRegex.exec(html)) !== null) {
            var trackTag = match[0];

            var kindMatch = trackTag.match(/kind=["']?([^"'\s>]+)["']?/i);
            var kind = kindMatch ? kindMatch[1].toLowerCase() : "";
            if (kind && kind !== "subtitles" && kind !== "captions") {
                continue;
            }

            var srcMatch = trackTag.match(/src=["']?([^"'\s>]+)["']?/i);
            var labelMatch = trackTag.match(/label=["']?([^"'>]+)["']?/i);
            var langMatch = trackTag.match(/srclang=["']?([^"'\s>]+)["']?/i);

            if (srcMatch) {
                var file = srcMatch[1];
                var label = labelMatch ? labelMatch[1].trim() : (langMatch ? langMatch[1].trim() : "Subtitle");

                if (file && !subtitles.some(s => s.file === file)) {
                    subtitles.push({
                        file: file,
                        label: label
                    });
                }
            }
        }

        // 2. DOM select fallback for track elements
        try {
            var trackEls = doc.select("track");
            for (var tr of trackEls) {
                var trKind = (tr.attr("kind") || "").toLowerCase();
                if (trKind && trKind !== "subtitles" && trKind !== "captions") continue;
                var trSrc = tr.attr("src") || "";
                var trLabel = tr.attr("label") || tr.attr("srclang") || "Subtitle";
                if (trSrc && !subtitles.some(s => s.file === trSrc)) {
                    subtitles.push({
                        file: trSrc,
                        label: trLabel.trim()
                    });
                }
            }
        } catch (e) {}

        // 1. Check <media-player src="..."> (Vidstack player)
        var playerEl = doc.selectFirst("media-player");
        var playerSrc = playerEl ? (playerEl.attr("src") || "") : "";
        if (!playerSrc) {
            var pMatch = html.match(/<media-player[^>]+src=["']?([^"'\s>]+)["']?/i);
            if (pMatch) playerSrc = pMatch[1];
        }

        if (playerSrc) {
            var vidObj = {
                url: playerSrc,
                originalUrl: playerSrc,
                quality: "Auto (m3u8)",
                headers: streamHeaders
            };
            if (subtitles.length > 0) {
                vidObj.subtitles = subtitles;
            }
            videos.push(vidObj);
        }

        // 2. Fallback: Check <video> or <source> tags
        if (videos.length === 0) {
            var sourceEls = doc.select("video source, source[type*=video], video[src]");
            for (var srcEl of sourceEls) {
                var videoUrl = srcEl.attr("src") || "";
                if (videoUrl) {
                    var vidObj = {
                        url: videoUrl,
                        originalUrl: videoUrl,
                        quality: srcEl.attr("label") || "Default",
                        headers: streamHeaders
                    };
                    if (subtitles.length > 0) {
                        vidObj.subtitles = subtitles;
                    }
                    videos.push(vidObj);
                }
            }
        }

        // 3. Fallback: Check iframe embeds
        if (videos.length === 0) {
            var iframes = doc.select("iframe[src]");
            for (var iframe of iframes) {
                var iframeSrc = iframe.attr("src") || "";
                if (iframeSrc && !iframeSrc.includes("a-ads.com")) {
                    var vidObj = {
                        url: iframeSrc,
                        originalUrl: iframeSrc,
                        quality: "Embed Player",
                        headers: streamHeaders
                    };
                    if (subtitles.length > 0) {
                        vidObj.subtitles = subtitles;
                    }
                    videos.push(vidObj);
                }
            }
        }

        return videos;
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [];
    }
}
