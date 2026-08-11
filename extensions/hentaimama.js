var mangayomiSources = [{
    "name": "Hentaimama",
    "lang": "en",
    "baseUrl": "https://hentaimama.io",
    "apiUrl": "https://hentaimama.io/wp-admin/admin-ajax.php",
    "iconUrl": "https://hentaimama.io/wp-content/uploads/2021/04/favicon.png",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.1.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": true,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/hentaimama.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 827364510,
    "notes": "HentaiMama extension with robust extraction and pagination",
    "pkgPath": "nsfw/hentaimama.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://hentaimama.io";
        this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }

    getHeaders(referer) {
        return {
            "User-Agent": this.userAgent,
            "Referer": referer || this.baseUrl + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        };
    }

    async getPopular(page) {
        try {
            var url = this.baseUrl + (page > 1 ? "/page/" + page + "/" : "/");
            var res = await this.client.get(url, this.getHeaders());
            var doc = new Document(res.body);
            var list = [];
            
            // On page 1, include featured monthly releases
            if (page == 1) {
                var featured = doc.select("#dt-episodes-hot article.item");
                list = this.parseItemList(featured);
            }
            
            // Append main loop items
            var items = doc.select(".items article.item");
            var mainList = this.parseItemList(items);
            
            // Merge lists ensuring no duplicates by link
            for (var i = 0; i < mainList.length; i++) {
                var exists = false;
                for (var j = 0; j < list.length; j++) {
                    if (list[j].link == mainList[i].link) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) list.push(mainList[i]);
            }
            
            var hasNextPage = doc.selectFirst("a.next") != null || items.length >= 10;
            return { list: list, hasNextPage: hasNextPage };
        } catch (e) {
            console.log("getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }

    async search(query, page, filters) {
        try {
            var url = this.baseUrl + (page > 1 ? "/page/" + page + "/" : "/") + "?s=" + encodeURIComponent(query);
            var res = await this.client.get(url, this.getHeaders());
            var doc = new Document(res.body);
            var items = doc.select(".result-item article");
            var list = [];
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var titleEl = item.selectFirst(".title a");
                var imgEl = item.selectFirst("img");
                if (titleEl) {
                    list.push({
                        name: titleEl.text.trim(),
                        imageUrl: imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "",
                        link: titleEl.attr("href") || ""
                    });
                }
            }
            
            var hasNextPage = doc.selectFirst("a.next") != null || items.length >= 10;
            return { list: list, hasNextPage: hasNextPage };
        } catch (e) {
            console.log("search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getDetail(url) {
        try {
            var res = await this.client.get(url, this.getHeaders());
            var doc = new Document(res.body);
            
            // Robust title extraction
            var titleEl = doc.selectFirst(".data h1") || doc.selectFirst("#single h1") || doc.selectFirst("h1:not(.text)");
            var title = titleEl ? titleEl.text.trim() : "Unknown Anime";
            
            // Description with fallback
            var descEl = doc.selectFirst(".wp-content p") || doc.selectFirst("#info1 .wp-content");
            var description = descEl ? descEl.text.trim() : "No description available.";
            
            // Poster with fallback
            var imgEl = doc.selectFirst(".sheader .poster img") || doc.selectFirst(".poster img");
            var imageUrl = imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "";
            
            // Chapters (Episodes)
            var chapters = [];
            var episodeItems = doc.select(".episodios li");
            
            if (episodeItems.length > 0) {
                for (var i = 0; i < episodeItems.length; i++) {
                    var item = episodeItems[i];
                    var linkEl = item.selectFirst("a");
                    var titleEl = item.selectFirst(".episodiotitle a");
                    if (linkEl) {
                        chapters.push({
                            name: titleEl ? titleEl.text.trim() : "Episode " + (i + 1),
                            url: linkEl.attr("href") || ""
                        });
                    }
                }
            } else {
                // Alternative structure for some pages
                var altItems = doc.select("article.item.se.episodes");
                if (altItems.length > 0) {
                    for (var i = 0; i < altItems.length; i++) {
                        var item = altItems[i];
                        var linkEl = item.selectFirst("a");
                        var epName = item.selectFirst(".c") ? item.selectFirst(".c").text.trim() : "Episode " + (i + 1);
                        if (linkEl) {
                            chapters.push({
                                name: epName,
                                url: linkEl.attr("href") || ""
                            });
                        }
                    }
                } else {
                    // Fallback to single episode if it's already an episode page
                    chapters.push({ name: title, url: url });
                }
            }
            
            // Genres
            var genre = [];
            var genreEls = doc.select(".sgeneros a, .genres a");
            for (var i = 0; i < genreEls.length; i++) {
                var g = genreEls[i].text.trim();
                if (g) genre.push(g);
            }

            return {
                name: title,
                imageUrl: imageUrl,
                description: description,
                genre: genre,
                status: 1, // Completed for Hentai usually
                chapters: chapters
            };
        } catch (e) {
            console.log("getDetail error: " + e);
            return null;
        }
    }

    resolveUrl(path, baseUrl) {
        if (!path) return "";
        if (path.startsWith("http://") || path.startsWith("https://")) {
            return path;
        }
        if (path.startsWith("//")) {
            return "https:" + path;
        }
        if (path.startsWith("/")) {
            var match = baseUrl.match(/^(https?:\/\/[^\/]+)/);
            var domainRoot = match ? match[1] : baseUrl;
            return domainRoot + path;
        }
        var baseDir = baseUrl;
        if (baseUrl.includes("?")) {
            baseDir = baseUrl.substring(0, baseUrl.indexOf("?"));
        }
        var lastSlash = baseDir.lastIndexOf("/");
        if (lastSlash > 8) {
            baseDir = baseDir.substring(0, lastSlash);
        }
        return baseDir + "/" + path;
    }

    async getVideoList(url) {
        var videos = [];
        try {
            var res = await this.client.get(url, this.getHeaders(url));
            var content = res.body;
            
            // Sanitize and extract post ID
            var postIdMatch = content.match(/name="idpost" value="(\d+)"/) || content.match(/data-id="(\d+)"/);
            if (!postIdMatch) return [];
            var postId = postIdMatch[1];
            
            // POST request to AJAX endpoint
            var ajaxRes = await this.client.post(this.baseUrl + "/wp-admin/admin-ajax.php", {
                "User-Agent": this.userAgent,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": url,
                "X-Requested-With": "XMLHttpRequest"
            }, "action=get_player_contents&a=" + postId);
            
            if (ajaxRes.statusCode == 200) {
                var players = JSON.parse(ajaxRes.body);
                
                var loadSubs = new SharedPreferences().get("load_subtitles");
                var wantSubs = (loadSubs === true || loadSubs === "true" || loadSubs === null);
                
                for (var i = 0; i < players.length; i++) {
                    var playerHtml = players[i];
                    // Secure extraction of the encoded parameter
                    var pMatch = playerHtml.match(/new\d*\.php\?p=([^"&]+)/);
                    if (pMatch) {
                        var encodedP = pMatch[1];
                        var decodedP = this.base64Decode(encodedP);
                        
                        // Validate decoded path for basic sanity
                        if (decodedP && (decodedP.endsWith(".mp4") || decodedP.endsWith(".mkv") || decodedP.includes("/"))) {
                            var videoUrl = "https://gdvid.info/" + decodedP;
                            var videoObj = {
                                url: videoUrl,
                                originalUrl: videoUrl,
                                quality: "Direct - gdvid.info",
                                headers: this.getHeaders("https://hentaimama.io/")
                            };
                            
                            if (wantSubs) {
                                var subtitles = [];
                                try {
                                    var iframeSrc = "";
                                    var srcMatch = playerHtml.match(/src="([^"]+)"/);
                                    if (srcMatch) {
                                        iframeSrc = srcMatch[1];
                                    } else {
                                        iframeSrc = "/" + pMatch[0];
                                    }
                                    
                                    var iframeUrl = this.resolveUrl(iframeSrc, this.baseUrl);
                                    var iframeRes = await this.client.get(iframeUrl, {
                                        "Referer": url,
                                        "User-Agent": this.userAgent
                                    });
                                    
                                    if (iframeRes.statusCode == 200) {
                                        var iframeHtml = iframeRes.body;
                                        var iframeDoc = new Document(iframeHtml);
                                        
                                        // 1. Scrape track elements
                                        var trackEls = iframeDoc.select("track[kind=subtitles], track[kind=captions], track");
                                        for (var j = 0; j < trackEls.length; j++) {
                                            var track = trackEls[j];
                                            var trackSrc = track.attr("src") || "";
                                            var trackLabel = track.attr("label") || track.attr("srclang") || "Subtitle";
                                            if (trackSrc) {
                                                var resolvedTrackSrc = this.resolveUrl(trackSrc, iframeUrl);
                                                subtitles.push({ file: resolvedTrackSrc, label: trackLabel });
                                            }
                                        }
                                        
                                        // 2. Fallback: Parse tracks from JWPlayer setup script
                                        if (subtitles.length === 0) {
                                            var tracksRegex = /tracks:\s*(\[[^\]]+\])/;
                                            var tracksMatch = iframeHtml.match(tracksRegex);
                                            if (tracksMatch) {
                                                var tracksStr = tracksMatch[1];
                                                var fileMatches = tracksStr.match(/file:\s*["']([^"']+)["']/g);
                                                var labelMatches = tracksStr.match(/label:\s*["']([^"']+)["']/g);
                                                if (fileMatches) {
                                                    for (var k = 0; k < fileMatches.length; k++) {
                                                        var fileUrl = fileMatches[k].match(/["']([^"']+)["']/)[1];
                                                        var label = "Subtitle";
                                                        if (labelMatches && labelMatches[k]) {
                                                            label = labelMatches[k].match(/["']([^"']+)["']/)[1];
                                                        }
                                                        if (fileUrl) {
                                                            var resolvedFileUrl = this.resolveUrl(fileUrl, iframeUrl);
                                                            subtitles.push({ file: resolvedFileUrl, label: label });
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        
                                        // 3. Fallback: Regex scan for .vtt or .srt URLs
                                        if (subtitles.length === 0) {
                                            var vttMatches = iframeHtml.match(/https?:\/\/[^\s"'<>]+\.(vtt|srt)[^\s"'<>]*/gi) || [];
                                            for (var k = 0; k < vttMatches.length; k++) {
                                                var vttUrl = vttMatches[k];
                                                var exists = false;
                                                for (var m = 0; m < subtitles.length; m++) {
                                                    if (subtitles[m].file === vttUrl) {
                                                        exists = true;
                                                        break;
                                                    }
                                                }
                                                if (!exists) {
                                                    subtitles.push({ file: vttUrl, label: "Subtitle" });
                                                }
                                            }
                                        }
                                        
                                        // 4. Fallback: Scan relative paths
                                        if (subtitles.length === 0) {
                                            var relMatches = iframeHtml.match(/(?:["'])([^"'\s<>+]*\.(?:vtt|srt))(?:["'])/gi) || [];
                                            for (var k = 0; k < relMatches.length; k++) {
                                                var relPath = relMatches[k].replace(/["']/g, "").trim();
                                                if (relPath && !relPath.startsWith("http")) {
                                                    var baseDir = iframeUrl.substring(0, iframeUrl.lastIndexOf("/")) || iframeUrl;
                                                    var resolvedRelPath = this.resolveUrl(relPath, baseDir);
                                                    var exists = false;
                                                    for (var m = 0; m < subtitles.length; m++) {
                                                        if (subtitles[m].file === resolvedRelPath) {
                                                            exists = true;
                                                            break;
                                                        }
                                                    }
                                                    if (!exists) {
                                                        subtitles.push({ file: resolvedRelPath, label: "Subtitle" });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch (subErr) {
                                    console.log("Subtitle extraction error: " + subErr);
                                }
                                
                                if (subtitles.length > 0) {
                                    videoObj.subtitles = subtitles;
                                }
                            }
                            
                            videos.push(videoObj);
                        }
                    }
                }
            }
            return videos;
        } catch (e) {
            console.log("getVideoList error: " + e);
            return videos;
        }
    }

    // Helper to parse lists robustly
    parseItemList(elements) {
        var list = [];
        for (var i = 0; i < elements.length; i++) {
            var item = elements[i];
            var linkEl = item.selectFirst("a");
            var imgEl = item.selectFirst("img");
            var nameEl = item.selectFirst(".serie") || item.selectFirst("h3") || item.selectFirst(".title");
            
            if (linkEl && nameEl) {
                list.push({
                    name: nameEl.text.trim(),
                    imageUrl: imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "",
                    link: linkEl.attr("href") || ""
                });
            }
        }
        return list;
    }

    base64Decode(input) {
        try {
            var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
            var str = String(input).replace(/[=]+$/, '');
            if (str.length % 4 == 1) return ""; 
            for (
                var bc = 0, bs, buffer, idx = 0, output = '';
                buffer = str.charAt(idx++);
                ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
                    bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
            ) {
                buffer = chars.indexOf(buffer);
            }
            return output;
        } catch (e) {
            return "";
        }
    }

    async getPageList(url) { return []; }
    getFilterList() { return []; }
    getSourcePreferences() {
        return [
            {
                key: "load_subtitles",
                switchPreferenceCompat: {
                    title: "Load Subtitles",
                    summary: "Attach subtitle tracks from the player when available",
                    value: true
                }
            }
        ];
    }
}



