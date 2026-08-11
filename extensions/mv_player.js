const mangayomiSources = [{
    "name": "MV Player",
    "lang": "en",
    "baseUrl": "https://sulasok.am",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=github.com",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/real/mv_player.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 918273645,
    "notes": "Generic MV Player",
    "pkgPath": "real/mv_player.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://sulasok.am";
        this.watchBase = "https://sulasokvids.xyz";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        };
    }

    parseShowList(html) {
        var list = [];
        var doc = new Document(html);
        var elements = doc.select('div.col');
        
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var aTag = el.selectFirst("a.video_title");
            if (!aTag) continue;
            
            var title = aTag.text ? aTag.text.trim() : "";
            var link = aTag.attr("href");
            
            if (link.includes("watch.php?id=")) {
                var idMatch = link.match(/id=([^&]+)/);
                if (idMatch) {
                    link = idMatch[1];
                }
            } else {
                continue; // Skip non-video links
            }
            
            var imgUrl = "";
            var imgContainer = el.selectFirst(".itemsContainer");
            if (imgContainer) {
                var styleStr = imgContainer.attr("style") || "";
                // Robust regex for url("...") or url(...) with entity decoding
                var imgMatch = styleStr.match(/url\((.*?)\)/);
                if (imgMatch) {
                    imgUrl = imgMatch[1].replace(/&quot;/g, "").replace(/['"]/g, "").trim();
                }
            }
            
            // Fallback: Check if there's a real img tag (not the placeholder)
            if (!imgUrl || imgUrl.includes("style-853x480.png")) {
                var imgTag = el.selectFirst("img");
                if (imgTag) {
                    var src = imgTag.attr("src");
                    if (src && !src.includes("style-853x480.png")) {
                        imgUrl = src;
                    }
                }
            }

            if (imgUrl && !imgUrl.startsWith("http")) {
                if (imgUrl.startsWith("/")) {
                    imgUrl = this.baseUrl + imgUrl;
                } else {
                    imgUrl = this.baseUrl + "/" + imgUrl;
                }
            }
            
            list.push({
                name: title,
                imageUrl: imgUrl,
                link: link
            });
        }
        return list;
    }

    async getPopular(page) {
        console.log("MidnightVids getPopular page=" + page);
        try {
            var start = (page - 1) * 12;
            var url = this.baseUrl + "/load_more_random.php?start=" + start + "&limit=12&filter=best";
            var res = await this.client.get(url, this.getHeaders());
            var list = this.parseShowList(res.body);
            return { list: list, hasNextPage: list.length === 12 };
        } catch (e) {
            console.log("MidnightVids getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getLatestUpdates(page) {
        console.log("MidnightVids getLatestUpdates page=" + page);
        try {
            var start = (page - 1) * 12;
            var url = this.baseUrl + "/load_more_random.php?start=" + start + "&limit=12";
            var res = await this.client.get(url, this.getHeaders());
            var list = this.parseShowList(res.body);
            return { list: list, hasNextPage: list.length === 12 };
        } catch (e) {
            console.log("MidnightVids getLatestUpdates error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async search(query, page, filters) {
        console.log("MidnightVids search: " + query + " page=" + page);
        try {
            var start = (page - 1) * 12;
            var url = this.baseUrl + "/load_more_search.php?start=" + start + "&limit=12&search=" + encodeURIComponent(query);
            var res = await this.client.get(url, this.getHeaders());
            var list = this.parseShowList(res.body);
            return { list: list, hasNextPage: list.length === 12 };
        } catch (e) {
            console.log("MidnightVids search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getDetail(url) {
        console.log("MidnightVids getDetail: " + url);
        try {
            var videoId = url;
            
            var episodes = [];
            episodes.push({
                name: "Watch Video",
                url: videoId
            });

            return {
                name: "Video " + videoId, // It will use the cached title from UI
                imageUrl: "",
                description: "Midnight Video",
                genre: ["NSFW"],
                status: 1, // FINISHED
                episodes: episodes
            };
        } catch (e) {
            console.log("MidnightVids getDetail error: " + e);
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, episodes: [] };
        }
    }

    manualUnpack(packed) {
        try {
            var m = packed.match(/\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\s*\.split\(/);
            if (!m) return "";
            var p = m[1];
            var a = parseInt(m[2], 10);
            var c = parseInt(m[3], 10);
            var k = m[4].split("|");

            function toBase(n) {
                var r = "";
                if (n >= a) r = toBase(Math.floor(n / a));
                n = n % a;
                if (n > 35) r += String.fromCharCode(n + 29);
                else r += n.toString(36);
                return r;
            }

            var d = {};
            for (var i = 0; i < c; i++) {
                var key = toBase(i);
                d[key] = k[i] !== undefined && k[i] !== "" ? k[i] : key;
            }

            return p.replace(/\b\w+\b/g, function (w) {
                return d.hasOwnProperty(w) ? d[w] : w;
            });
        } catch (e) {
            console.log("manualUnpack error: " + e);
            return "";
        }
    }

    async extractPackedM3u8(body) {
        try {
            var packedMatch = body.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)[\s\S]*?\)\)/g);
            if (packedMatch) {
                for (var i = 0; i < packedMatch.length; i++) {
                    var unpacked = this.manualUnpack(packedMatch[i]);
                    if (!unpacked) continue;
                    
                    var m3u8Match = unpacked.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/);
                    if (m3u8Match) {
                        return m3u8Match[0];
                    }
                    var mp4Match = unpacked.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/);
                    if (mp4Match) {
                        return mp4Match[0];
                    }
                }
            }
        } catch (e) {
            console.log("extractPacked error: " + e);
        }
        return null;
    }

    async getVideoList(url) {
        console.log("MidnightVids getVideoList: " + url);
        try {
            var videoId = url;
            var videos = [];
            var servers = ["streamruby", "vidara", "doodstream"];
            
            for (var server of servers) {
                try {
                    var watchUrl = this.watchBase + "/video.php?id=" + videoId + "&s=" + server;
                    var res = await this.client.get(watchUrl, this.getHeaders());
                    
                    var match = res.body.match(/iframe\.src\s*=\s*"(.*?)"/) || res.body.match(/<iframe[^>]+src="(.*?)"/);
                    if (!match || !match[1]) continue;
                    var iframeUrl = match[1];
                    if (iframeUrl.includes("404.php")) continue;
                    
                    console.log("Found iframe: " + iframeUrl);

                    if (iframeUrl.includes("streamruby") || iframeUrl.includes("rubyvidhub")) {
                        var fileCode = iframeUrl.split("/e/")[1].split("?")[0];
                        var baseUrl = iframeUrl.split("/e/")[0];
                        var dlUrl = baseUrl + "/dl";
                        
                        var postHeaders = {
                            "Content-Type": "application/x-www-form-urlencoded",
                            "User-Agent": "Mozilla/5.0",
                            "Referer": iframeUrl
                        };
                        var postData = "op=embed&file_code=" + fileCode + "&auto=1&referer=";
                        var dlRes = await this.client.post(dlUrl, postHeaders, postData);
                        
                        var m3u8 = await this.extractPackedM3u8(dlRes.body);
                        if (m3u8) {
                            videos.push({
                                url: m3u8,
                                originalUrl: m3u8,
                                quality: "Server - StreamRuby",
                                headers: null
                            });
                        }
                    } else if (iframeUrl.includes("vidara.so")) {
                        var vRes = await this.client.get(iframeUrl, { "Referer": this.watchBase + "/" });
                        var m3u8 = await this.extractPackedM3u8(vRes.body);
                        if (m3u8) {
                            videos.push({
                                url: m3u8,
                                originalUrl: m3u8,
                                quality: "Server - Vidara",
                                headers: null
                            });
                        }
                    } else {
                        // For Doodstream, try to return it and hope Mangayomi catches it, or skip
                        videos.push({
                            url: iframeUrl,
                            originalUrl: iframeUrl,
                            quality: "Server - " + server.toUpperCase(),
                            headers: null
                        });
                    }
                } catch (err) {
                    console.log("Error extracting server " + server + ": " + err);
                }
            }

            return videos;
            
        } catch (e) {
            console.log("MidnightVids getVideoList error: " + e);
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
        return [];
    }
}



