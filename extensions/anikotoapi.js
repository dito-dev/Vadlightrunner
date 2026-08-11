const mangayomiSources = [{
    "name": "AniKoto API",
    "lang": "en",
    "baseUrl": "https://anikotoapi.site",
    "apiUrl": "https://anikotoapi.site",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=anikotoapi.site",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.4",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/anikotoapi.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 984102837,
    "notes": "AniKoto API extension with MegaPlay embed player",
    "pkgPath": "working/anikotoapi.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://anikotoapi.site";
        this.apiUrl = "https://anikotoapi.site";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*"
        };
    }

    getPref(key, defaultValue) {
        try {
            var val = new SharedPreferences().get(key);
            if (val !== undefined && val !== null && val !== "") return val;
        } catch (e) {}
        return defaultValue;
    }

    parseShowList(animeDataList) {
        var list = [];
        if (!animeDataList || !Array.isArray(animeDataList)) return list;

        for (var item of animeDataList) {
            if (!item || !item.id) continue;
            var title = item.title || item.alternative || item.native || "";
            if (!title) continue;

            var imageUrl = item.poster || item.background_image || "";
            list.push({
                name: title.trim(),
                imageUrl: imageUrl,
                link: item.id.toString()
            });
        }
        return list;
    }

    async getPopular(page) {
        console.log("AniKoto API getPopular page=" + page);
        try {
            var perPage = 24;
            var url = this.baseUrl + "/recent-anime?page=" + page + "&per_page=" + perPage;
            var res = await this.client.get(url, this.getHeaders());
            if (res.statusCode !== 200) {
                console.log("getPopular HTTP error: " + res.statusCode);
                return { list: [], hasNextPage: false };
            }
            var json = JSON.parse(res.body);
            if (!json.ok || !json.data) {
                return { list: [], hasNextPage: false };
            }

            var list = this.parseShowList(json.data);
            var hasNextPage = false;
            if (json.pagination) {
                hasNextPage = json.pagination.page < json.pagination.total_pages;
            } else {
                hasNextPage = json.data.length >= perPage;
            }

            return { list: list, hasNextPage: hasNextPage };
        } catch (e) {
            console.log("getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getLatestUpdates(page) {
        console.log("AniKoto API getLatestUpdates page=" + page);
        return await this.getPopular(page);
    }

    async search(query, page, filters) {
        console.log("AniKoto API search query=" + query + " page=" + page);
        try {
            var perPage = 24;
            var q = (query || "").trim();
            var url = this.baseUrl + "/recent-anime?search=" + encodeURIComponent(q) + "&page=" + page + "&per_page=" + perPage;
            var res = await this.client.get(url, this.getHeaders());
            if (res.statusCode !== 200) {
                return { list: [], hasNextPage: false };
            }
            var json = JSON.parse(res.body);
            if (!json.ok || !json.data) {
                return { list: [], hasNextPage: false };
            }

            var rawList = json.data;
            if (q.length > 0) {
                var qLower = q.toLowerCase();
                rawList = rawList.filter(function(item) {
                    var t = (item.title || "").toLowerCase();
                    var alt = (item.alternative || "").toLowerCase();
                    var nat = (item.native || "").toLowerCase();
                    var titles = (item.titles || "").toLowerCase();
                    return t.includes(qLower) || alt.includes(qLower) || nat.includes(qLower) || titles.includes(qLower);
                });
            }

            var list = this.parseShowList(rawList);
            var hasNextPage = false;
            if (json.pagination) {
                hasNextPage = json.pagination.page < json.pagination.total_pages;
            }

            return { list: list, hasNextPage: hasNextPage };
        } catch (e) {
            console.log("search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getDetail(url) {
        console.log("AniKoto API getDetail: " + url);
        try {
            var seriesId = url.trim();
            var apiUrl = this.baseUrl + "/series/" + encodeURIComponent(seriesId);
            var res = await this.client.get(apiUrl, this.getHeaders());
            if (res.statusCode !== 200) {
                throw new Error("Failed to fetch series details: " + res.statusCode);
            }

            var json = JSON.parse(res.body);
            if (!json.ok || !json.data) {
                throw new Error("Invalid series detail response");
            }

            var animeData = json.data.anime || {};
            var title = animeData.title || animeData.alternative || animeData.native || "Anime " + seriesId;
            var imageUrl = animeData.poster || animeData.background_image || "";
            var description = animeData.description || "";
            
            var genres = [];
            if (animeData.terms_by_type && Array.isArray(animeData.terms_by_type.genre)) {
                genres = animeData.terms_by_type.genre;
            }

            var status = 5;
            if (animeData.status) {
                var st = animeData.status.toLowerCase();
                if (st.includes("currently") || st.includes("releasing") || st.includes("airing")) status = 0;
                else if (st.includes("finished") || st.includes("completed")) status = 1;
                else if (st.includes("hiatus")) status = 2;
                else if (st.includes("cancelled")) status = 3;
                else if (st.includes("not yet")) status = 4;
            }

            var chapters = [];
            var episodes = json.data.episodes || [];
            for (var ep of episodes) {
                var epNum = ep.number || 1;
                var epTitle = ep.title || ("Episode " + epNum);
                var epId = ep.id || epNum;
                var embedUrls = ep.embed_url || {};
                var embedJsonStr = JSON.stringify(embedUrls);

                var epUrl = seriesId + "||" + epNum + "||" + epId + "||" + encodeURIComponent(embedJsonStr);
                chapters.push({
                    name: epTitle,
                    url: epUrl
                });
            }

            chapters.reverse();

            var link = this.baseUrl + "/series/" + seriesId;

            return {
                link: link,
                name: title,
                imageUrl: imageUrl,
                description: description,
                genre: genres,
                status: status,
                chapters: chapters
            };
        } catch (e) {
            console.log("getDetail error: " + e);
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
        }
    }

    async fetchMegaPlaySources(embedUrl, labelType) {
        var videos = [];
        if (!embedUrl || typeof embedUrl !== "string") return videos;

        try {
            var proxyHost = "https://megacloud.animanga.fun";
            var embedHeaders = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://anikotoapi.site/"
            };

            var embedRes = await this.client.get(embedUrl, embedHeaders);
            if (embedRes.statusCode !== 200) {
                console.log("Embed page returned status: " + embedRes.statusCode);
                return videos;
            }

            var html = embedRes.body || "";
            var realIdMatch = html.match(/data-id=["'](\d+)["']/);
            if (!realIdMatch) {
                console.log("data-id not found in embed page");
                return videos;
            }

            var realSourceId = realIdMatch[1];
            var hostMatch = embedUrl.match(/^(https?:\/\/[^\/]+)/);
            var hostBase = hostMatch ? hostMatch[1] : "https://megaplay.buzz";

            var srcUrl = hostBase + "/stream/getSources?id=" + realSourceId;
            var srcHeaders = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": embedUrl,
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json, text/javascript, */*; q=0.01"
            };

            var srcRes = await this.client.get(srcUrl, srcHeaders);
            if (srcRes.statusCode !== 200) {
                console.log("getSources returned status: " + srcRes.statusCode);
                return videos;
            }

            var srcData = JSON.parse(srcRes.body);

            var sourceList = [];
            if (srcData.sources) {
                if (Array.isArray(srcData.sources)) {
                    sourceList = srcData.sources;
                } else if (typeof srcData.sources === "object" && srcData.sources.file) {
                    sourceList = [srcData.sources];
                }
            } else if (srcData.file) {
                sourceList = [srcData];
            }

            var subtitles = [];
            if (srcData.tracks && Array.isArray(srcData.tracks)) {
                for (var track of srcData.tracks) {
                    if (track && track.file && (track.kind === "captions" || track.kind === "subtitles")) {
                        var subProxyUrl = proxyHost + "/fetch?url=" + encodeURIComponent(track.file) + "&ref=" + encodeURIComponent("https://megaplay.buzz/");
                        subtitles.push({
                            file: subProxyUrl,
                            label: track.label || "Unknown"
                        });
                    }
                }
            }

            var streamHeaders = {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.5",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "cross-site",
                "origin": "https://megaplay.buzz",
                "referer": "https://megaplay.buzz/"
            };

            for (var src of sourceList) {
                if (!src) continue;
                var fileUrl = src.file || src.url || "";
                if (fileUrl) {
                    var qualityTag = "AniKoto (" + labelType.toUpperCase() + ") - " + (src.label || "Auto");
                    var proxyUrl = proxyHost + "/proxy?url=" + encodeURIComponent(fileUrl) + "&headers=" + encodeURIComponent(JSON.stringify(streamHeaders));

                    videos.push({
                        url: proxyUrl,
                        originalUrl: fileUrl,
                        quality: qualityTag,
                        subtitles: subtitles,
                        headers: streamHeaders
                    });
                }
            }
        } catch (e) {
            console.log("fetchMegaPlaySources error: " + e);
        }
        return videos;
    }

    async getVideoList(url) {
        console.log("AniKoto API getVideoList: " + url);
        try {
            var parts = url.split("||");
            var seriesId = parts[0];
            var epNum = parts[1];
            var epId = parts[2];
            var embedUrls = {};

            if (parts.length >= 4 && parts[3]) {
                var rawEmbedStr = parts[3];
                try {
                    embedUrls = JSON.parse(rawEmbedStr);
                } catch (e1) {
                    try {
                        embedUrls = JSON.parse(decodeURIComponent(rawEmbedStr));
                    } catch (e2) {}
                }
            }

            if (!embedUrls.sub && !embedUrls.dub && !embedUrls.hsub) {
                try {
                    var sRes = await this.client.get(this.baseUrl + "/series/" + encodeURIComponent(seriesId), this.getHeaders());
                    if (sRes.statusCode === 200) {
                        var sJson = JSON.parse(sRes.body);
                        if (sJson.ok && sJson.data && sJson.data.episodes) {
                            var targetEp = sJson.data.episodes.find(function(e) { return (e.number == epNum) || (e.id == epId); });
                            if (targetEp && targetEp.embed_url) {
                                embedUrls = targetEp.embed_url;
                            }
                        }
                    }
                } catch (refetchErr) {
                    console.log("Refetch series failed: " + refetchErr);
                }
            }

            var prefType = this.getPref("preferred_type", "sub");
            var primaryType = prefType === "dub" ? "dub" : "sub";
            var secondaryType = primaryType === "sub" ? "dub" : "sub";

            var videos = [];

            if (embedUrls[primaryType]) {
                var primVids = await this.fetchMegaPlaySources(embedUrls[primaryType], primaryType);
                if (primVids && primVids.length > 0) videos = videos.concat(primVids);
            }

            if (primaryType === "sub" && embedUrls["hsub"]) {
                var hsubVids = await this.fetchMegaPlaySources(embedUrls["hsub"], "hsub");
                if (hsubVids && hsubVids.length > 0) videos = videos.concat(hsubVids);
            }

            if (embedUrls[secondaryType]) {
                var secVids = await this.fetchMegaPlaySources(embedUrls[secondaryType], secondaryType);
                if (secVids && secVids.length > 0) videos = videos.concat(secVids);
            }

            if (videos.length === 0) {
                for (var lang in embedUrls) {
                    if (embedUrls[lang] && typeof embedUrls[lang] === "string") {
                        var langVids = await this.fetchMegaPlaySources(embedUrls[lang], lang);
                        if (langVids && langVids.length > 0) videos = videos.concat(langVids);
                    }
                }
            }

            console.log("AniKoto API resolved " + videos.length + " video streams");
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
                key: "preferred_type",
                listPreference: {
                    title: "Preferred Audio / Subtitle Type",
                    summary: "Select preferred audio/sub format (Sub or Dub)",
                    valueIndex: 0,
                    entries: ["Sub", "Dub"],
                    entryValues: ["sub", "dub"]
                }
            }
        ];
    }
}
