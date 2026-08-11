const mangayomiSources = [{
    "name": "TubePornClassic",
    "lang": "en",
    "baseUrl": "https://tubepornclassic.com",
    "apiUrl": "https://tubepornclassic.com/api",
    "iconUrl": "https://tubepornclassic.com/static/images/favicons/favicon-32x32.png",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/tubepornclassic.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 889861811,
    "notes": "TubePornClassic extension.",
    "pkgPath": "nsfw/tubepornclassic.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://tubepornclassic.com";
        this.apiUrl = "https://tubepornclassic.com/api";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://tubepornclassic.com/"
        };
    }

    getStreamHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://tubepornclassic.com/"
        };
    }

    base164_decode(e) {
        const a = "АВСDЕFGHIJKLМNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,~";
        let t = "", s = 0;
        e = (e || "").replace(/[^АВСЕМA-Za-z0-9\.\,\~]/g, "");
        if (!e) return "";
        do {
            var i = a.indexOf(e.charAt(s++)),
                r = a.indexOf(e.charAt(s++)),
                c = a.indexOf(e.charAt(s++)),
                n = a.indexOf(e.charAt(s++)),
                d = (i << 18) | (r << 12) | (c << 6) | n,
                u = (d >> 16) & 255,
                p = (d >> 8) & 255,
                l = 255 & d;
            if (64 === c) t += String.fromCharCode(u);
            else if (64 === n) t += String.fromCharCode(u, p);
            else t += String.fromCharCode(u, p, l);
        } while (s < e.length);
        return t;
    }

    parseItemList(data) {
        var list = [];
        var items = data.videos || data.results || data.items || [];
        for (var item of items) {
            var videoId = item.video_id || item.id || "";
            var dir = item.dir || "";
            var thumb = item.thumbsrc || item.thumb || item.screen_url || "";
            if (!thumb && videoId) {
                var s2 = 1e3 * Math.floor(videoId / 1e3);
                thumb = "https://tn.tubepornclassic.com/contents/videos_screenshots/" + s2 + "/" + videoId + "/preview.jpg";
            }
            list.push({
                name: item.title || "Unknown",
                imageUrl: thumb,
                link: this.baseUrl + "/videos/" + videoId + "/" + dir + "/"
            });
        }
        return list;
    }

    async getPopular(page) {
        var pageNum = page || 1;
        var url = this.apiUrl + "/json/videos2/86400/str/most-popular/60/.." + pageNum + ".all...json";
        var res = await this.client.get(url, this.getHeaders());
        var data = JSON.parse(res.body);

        var list = this.parseItemList(data);
        var hasNextPage = list.length >= 60;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getLatestUpdates(page) {
        var pageNum = page || 1;
        var url = this.apiUrl + "/json/videos2/86400/str/latest-updates/60/.." + pageNum + ".all...json";
        var res = await this.client.get(url, this.getHeaders());
        var data = JSON.parse(res.body);

        var list = this.parseItemList(data);
        var hasNextPage = list.length >= 60;

        return { list: list, hasNextPage: hasNextPage };
    }

    async search(query, page, filters) {
        var pageNum = page || 1;
        var url = "";

        var sortValue = "latest-updates";
        if (filters && filters.length > 0) {
            for (var filter of filters) {
                if (filter.type_name === "SelectFilter" && filter.name === "Sort By") {
                    sortValue = filter.values[filter.state].value || sortValue;
                }
            }
        }

        if (query && query.trim() !== "") {
            url = this.apiUrl + "/videos2.php?params=86400/str/relevance/60/search.." + pageNum + ".all..&s=" + encodeURIComponent(query.trim());
        } else {
            url = this.apiUrl + "/json/videos2/86400/str/" + sortValue + "/60/.." + pageNum + ".all...json";
        }

        var res = await this.client.get(url, this.getHeaders());
        var data = JSON.parse(res.body);

        var list = this.parseItemList(data);
        var hasNextPage = list.length >= 60;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        var match = url.match(/videos\/(\d+)/) || url.match(/(\d+)/);
        if (!match) throw new Error("Invalid video URL: " + url);
        var videoId = match[1];

        var s1 = 1e6 * Math.floor(videoId / 1e6);
        var s2 = 1e3 * Math.floor(videoId / 1e3);
        var apiUrl = this.apiUrl + "/json/video/86400/" + s1 + "/" + s2 + "/" + videoId + ".json";

        var res = await this.client.get(apiUrl, this.getHeaders());
        var data = JSON.parse(res.body);
        var v = data.video || {};

        var genres = [];
        if (v.categories && typeof v.categories === "object") {
            for (var key in v.categories) {
                if (v.categories[key] && v.categories[key].title) {
                    genres.push(v.categories[key].title);
                }
            }
        }
        if (v.tags && typeof v.tags === "object") {
            for (var tagKey in v.tags) {
                if (v.tags[tagKey] && v.tags[tagKey].title) {
                    genres.push(v.tags[tagKey].title);
                }
            }
        }

        var chapters = [{
            name: v.title || ("Video " + videoId),
            url: this.baseUrl + "/videos/" + videoId + "/" + (v.dir || "") + "/",
            dateUpload: v.post_date ? String(new Date(v.post_date).getTime()) : null
        }];

        return {
            name: v.title || ("Video " + videoId),
            imageUrl: v.thumbsrc || v.thumb || "",
            description: (v.description || "").replace(/<[^>]*>/g, ""),
            genre: genres,
            status: 1,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        var match = url.match(/videos\/(\d+)/) || url.match(/(\d+)/);
        if (!match) return [];
        var videoId = match[1];

        var videos = [];
        var streamHeaders = this.getStreamHeaders();

        try {
            var apiUrl = this.apiUrl + "/videofile.php?video_id=" + videoId + "&lifetime=864000";
            var res = await this.client.get(apiUrl, this.getHeaders());
            var data = JSON.parse(res.body);

            if (Array.isArray(data)) {
                for (var item of data) {
                    if (item.video_url) {
                        var decoded = this.base164_decode(item.video_url);
                        if (decoded) {
                            var fullUrl = decoded.startsWith("http") ? decoded : (this.baseUrl + decoded);
                            var quality = "720p HD";
                            if (item.format) {
                                quality = item.format.replace(/^\./, "").toUpperCase();
                            }
                            videos.push({
                                url: fullUrl,
                                originalUrl: fullUrl,
                                quality: quality,
                                headers: streamHeaders
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.log("Error in videofile.php API: " + e.message);
        }

        // Fallback to detail API if videofile API failed or returned empty
        if (videos.length === 0) {
            try {
                var s1 = 1e6 * Math.floor(videoId / 1e6);
                var s2 = 1e3 * Math.floor(videoId / 1e3);
                var detailUrl = this.apiUrl + "/json/video/86400/" + s1 + "/" + s2 + "/" + videoId + ".json";
                var detailRes = await this.client.get(detailUrl, this.getHeaders());
                var detailData = JSON.parse(detailRes.body);
                var v = detailData.video || {};
                if (v.pv) {
                    var pvUrl = v.pv.startsWith("http") ? v.pv : ("https://" + v.pv);
                    videos.push({
                        url: pvUrl,
                        originalUrl: pvUrl,
                        quality: "720p HD Preview",
                        headers: streamHeaders
                    });
                }
            } catch (err) {
                console.log("Error fetching detail fallback: " + err.message);
            }
        }

        return videos;
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Latest Updates", value: "latest-updates" },
                    { type_name: "SelectOption", name: "Most Popular", value: "most-popular" },
                    { type_name: "SelectOption", name: "Top Rated", value: "top-rated" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred Quality",
                    summary: "Select default video quality",
                    valueIndex: 0,
                    entries: ["720p HD", "480p", "360p"],
                    entryValues: ["720p", "480p", "360p"]
                }
            }
        ];
    }
}
