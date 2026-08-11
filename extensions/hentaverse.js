const mangayomiSources = [{
    "name": "Hentaverse",
    "lang": "en",
    "baseUrl": "https://hentaverse.com",
    "apiUrl": "https://apiv2.hentaverse.com/api/v1/content",
    "iconUrl": "https://hentaverse.com/img/twitterOG.png",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/hentaverse.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 2062568151,
    "notes": "Hentaverse anime extension.",
    "pkgPath": "nsfw/hentaverse.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://hentaverse.com";
        this.apiUrl = "https://apiv2.hentaverse.com/api/v1/content";
        this.cdnUrl = "https://cdn.hentaverse.com";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": "https://hentaverse.com",
            "Referer": "https://hentaverse.com/"
        };
    }

    getStreamHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Origin": "https://hentaverse.com",
            "Referer": "https://hentaverse.com/"
        };
    }

    formatImageUrl(path) {
        if (!path) return "";
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        return this.cdnUrl + "/" + path.replace(/^\//, "");
    }

    parseItemList(items) {
        var list = [];
        if (!items || !Array.isArray(items)) return list;
        for (var item of items) {
            var slug = item.slug || item.id || "";
            var name = item.name || item.title || "Unknown";
            var img = this.formatImageUrl(item.image || item.thumbnail || item.videoPreview || "");
            
            list.push({
                name: name,
                imageUrl: img,
                link: this.baseUrl + "/hentai/" + slug
            });
        }
        return list;
    }

    parseHasNextPage(json, listLength) {
        var pagination = json.pagination || (json.data && json.data.pagination) || {};
        var hasNextPage = false;

        if (pagination.hasMore !== undefined) {
            hasNextPage = pagination.hasMore;
        } else if (pagination.page !== undefined && pagination.totalPages !== undefined) {
            hasNextPage = pagination.page < pagination.totalPages;
        } else if (pagination.videos || pagination.series) {
            var vPage = pagination.videos ? (pagination.videos.page < pagination.videos.totalPages) : false;
            var sPage = pagination.series ? (pagination.series.page < pagination.series.totalPages) : false;
            hasNextPage = vPage || sPage;
        } else {
            hasNextPage = listLength >= 20;
        }

        return !!hasNextPage;
    }

    async getPopular(page) {
        var url = this.apiUrl + "/series?page=" + page + "&limit=20";
        var res = await this.client.get(url, this.getHeaders());
        var json = JSON.parse(res.body);

        var items = (json.data && json.data.items) ? json.data.items : [];
        var list = this.parseItemList(items);
        var hasNextPage = this.parseHasNextPage(json, list.length);

        return { list: list, hasNextPage: hasNextPage };
    }

    async getLatestUpdates(page) {
        var url = this.apiUrl + "/videos?page=" + page + "&limit=20";
        var res = await this.client.get(url, this.getHeaders());
        var json = JSON.parse(res.body);

        var items = (json.data && json.data.items) ? json.data.items : [];
        var list = [];
        for (var item of items) {
            var slug = item.slug || item.id || "";
            var name = item.title || item.name || "Unknown";
            var img = this.formatImageUrl(item.thumbnail || item.image || "");

            list.push({
                name: name,
                imageUrl: img,
                link: this.baseUrl + "/video/" + slug
            });
        }

        var hasNextPage = this.parseHasNextPage(json, list.length);

        return { list: list, hasNextPage: hasNextPage };
    }

    async search(query, page, filters) {
        if (!query || query.trim() === "") {
            return this.getPopular(page);
        }

        var url = this.apiUrl + "/search?q=" + encodeURIComponent(query) + "&page=" + page + "&limit=20";
        
        if (filters && filters.length > 0) {
            for (var filter of filters) {
                if (filter.type_name === "SelectFilter" && filter.values && filter.values[filter.state]) {
                    var selectedValue = filter.values[filter.state].value;
                    if (selectedValue) {
                        if (filter.name === "Category") {
                            url += "&category=" + encodeURIComponent(selectedValue);
                        }
                    }
                }
            }
        }

        var res = await this.client.get(url, this.getHeaders());
        var json = JSON.parse(res.body);

        var list = [];
        if (json.data && json.data.results) {
            var resObj = json.data.results;
            if (resObj.series && Array.isArray(resObj.series)) {
                list = list.concat(this.parseItemList(resObj.series));
            }
            if (resObj.videos && Array.isArray(resObj.videos)) {
                for (var v of resObj.videos) {
                    list.push({
                        name: v.title || v.name || "Unknown",
                        imageUrl: this.formatImageUrl(v.thumbnail || v.image || ""),
                        link: this.baseUrl + "/video/" + (v.slug || v.id)
                    });
                }
            }
        } else if (json.data && json.data.items) {
            list = this.parseItemList(json.data.items);
        }

        var hasNextPage = this.parseHasNextPage(json, list.length);

        return { list: list, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        var slug = "";
        var isVideo = false;

        if (url.includes("/video/")) {
            slug = url.split("/video/")[1].split("?")[0].split("#")[0];
            isVideo = true;
        } else if (url.includes("/hentai/")) {
            slug = url.split("/hentai/")[1].split("?")[0].split("#")[0];
        } else {
            slug = url.split("/").pop();
        }

        var chapters = [];
        var name = "Unknown";
        var imageUrl = "";
        var description = "";
        var genres = [];
        var status = 1; // Completed by default for adult anime series

        if (isVideo) {
            var epRes = await this.client.get(this.apiUrl + "/videos/" + slug, this.getHeaders());
            var epJson = JSON.parse(epRes.body);
            var epData = epJson.data || {};

            name = epData.title || slug;
            imageUrl = this.formatImageUrl(epData.thumbnail || epData.imagePreview || "");
            description = (epData.description || "").replace(/<[^>]*>/g, '');

            if (epData.categories && Array.isArray(epData.categories)) {
                for (var cat of epData.categories) {
                    if (cat.name) genres.push(cat.name);
                }
            }

            chapters.push({
                name: epData.title || ("Episode " + (epData.episode || 1)),
                url: this.baseUrl + "/video/" + (epData.slug || slug),
                dateUpload: epData.createdAt ? String(new Date(epData.createdAt).getTime()) : null
            });

            if (epData.series && epData.series.slug) {
                try {
                    var sRes = await this.client.get(this.apiUrl + "/series/" + epData.series.slug, this.getHeaders());
                    var sJson = JSON.parse(sRes.body);
                    var sData = sJson.data || {};
                    if (sData.videos && Array.isArray(sData.videos)) {
                        chapters = [];
                        for (var v of sData.videos) {
                            chapters.push({
                                name: v.title || ("Episode " + (v.episode || 1)),
                                url: this.baseUrl + "/video/" + (v.slug || v.id),
                                dateUpload: v.createdAt ? String(new Date(v.createdAt).getTime()) : null
                            });
                        }
                    }
                } catch (e) {}
            }
        } else {
            var seriesRes = await this.client.get(this.apiUrl + "/series/" + slug, this.getHeaders());
            var seriesJson = JSON.parse(seriesRes.body);
            var seriesData = seriesJson.data || {};

            name = seriesData.name || slug;
            imageUrl = this.formatImageUrl(seriesData.image || "");
            description = (seriesData.description || seriesData.metaDescription || "").replace(/<[^>]*>/g, '');

            if (seriesData.categories && Array.isArray(seriesData.categories)) {
                for (var c of seriesData.categories) {
                    if (c.name) genres.push(c.name);
                }
            }

            if (seriesData.videos && Array.isArray(seriesData.videos)) {
                for (var item of seriesData.videos) {
                    chapters.push({
                        name: item.title || ("Episode " + (item.episode || 1)),
                        url: this.baseUrl + "/video/" + (item.slug || item.id),
                        dateUpload: item.createdAt ? String(new Date(item.createdAt).getTime()) : null
                    });
                }
            }
        }

        return {
            name: name,
            imageUrl: imageUrl,
            description: description,
            genre: genres,
            status: status,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        var slug = "";
        if (url.includes("/video/")) {
            slug = url.split("/video/")[1].split("?")[0].split("#")[0];
        } else {
            slug = url.split("/").pop();
        }

        var res = await this.client.get(this.apiUrl + "/videos/" + slug, this.getHeaders());
        var json = JSON.parse(res.body);
        var data = json.data || {};

        var videoPath = data.videoPath || "";
        if (!videoPath) return [];

        var subtitles = [];
        if (data.subtitles && Array.isArray(data.subtitles)) {
            for (var sub of data.subtitles) {
                if (sub.filePath) {
                    subtitles.push({
                        label: (sub.language || "en").toUpperCase(),
                        file: this.formatImageUrl(sub.filePath)
                    });
                }
            }
        }

        var streamHeaders = this.getStreamHeaders();
        var qualities = [
            { quality: "1080p (FHD)", file: "1080p.mp4" },
            { quality: "720p (HD)", file: "720p.mp4" },
            { quality: "480p (SD)", file: "480p.mp4" },
            { quality: "360p (SD)", file: "360p.mp4" }
        ];

        var videos = [];
        for (var q of qualities) {
            var streamUrl = this.cdnUrl + "/" + videoPath.replace(/^\//, "") + "/" + q.file;
            videos.push({
                url: streamUrl,
                originalUrl: streamUrl,
                quality: q.quality,
                subtitles: subtitles,
                headers: streamHeaders
            });
        }

        return videos;
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Category",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Big Boobs", value: "big-boobs" },
                    { type_name: "SelectOption", name: "Cosplay", value: "cosplay" },
                    { type_name: "SelectOption", name: "Maid", value: "maid" },
                    { type_name: "SelectOption", name: "Foot Job", value: "foot-job" },
                    { type_name: "SelectOption", name: "Mind Control", value: "mind-control" }
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
                    entries: ["1080p", "720p", "480p", "360p"],
                    entryValues: ["1080p", "720p", "480p", "360p"]
                }
            }
        ];
    }
}
