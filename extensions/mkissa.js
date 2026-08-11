const mangayomiSources = [{
    "name": "Mkissa",
    "lang": "en",
    "baseUrl": "https://mkissa.to/",
    "apiUrl": "https://api.mkissa.net/api",
    "iconUrl": "https://mkissa.to/favicon.ico",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": true,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/mkissa.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 1988463690,
    "notes": "Mkissa anime extension.",
    "pkgPath": "working/mkissa.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://mkissa.to/";
        this.apiUrl = "https://api.mkissa.net/api";
        this.cdnUrl = "https://aln.youtube-anime.com";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "Origin": "https://mkissa.to",
            "Referer": "https://mkissa.to/"
        };
    }

    getStreamHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://mkissa.to/"
        };
    }

    async getPopular(page) {
        var query = `
            query($search: SearchInput, $limit: Int, $page: Int) {
                shows(search: $search, limit: $limit, page: $page) {
                    pageInfo {
                        total
                    }
                    edges {
                        _id
                        name
                        englishName
                        nativeName
                        thumbnail
                        banner
                        availableEpisodes
                    }
                }
            }
        `;

        var payload = {
            query: query,
            variables: {
                search: { isManga: false },
                limit: 24,
                page: page
            }
        };

        var res = await this.client.post(this.apiUrl, this.getHeaders(), payload);
        var data = JSON.parse(res.body);

        var list = [];
        var shows = data.data && data.data.shows ? data.data.shows.edges || [] : [];

        for (var item of shows) {
            var title = item.englishName || item.name || item.nativeName || "Unknown";
            var image = item.thumbnail || item.banner || "";
            list.push({
                name: title,
                imageUrl: image,
                link: this.baseUrl + "anime/" + item._id
            });
        }

        var total = data.data && data.data.shows && data.data.shows.pageInfo ? data.data.shows.pageInfo.total || 0 : 0;
        var hasNextPage = (page * 24) < total;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }

    async search(query, page, filters) {
        var gqlQuery = `
            query($search: SearchInput, $limit: Int, $page: Int) {
                shows(search: $search, limit: $limit, page: $page) {
                    pageInfo {
                        total
                    }
                    edges {
                        _id
                        name
                        englishName
                        nativeName
                        thumbnail
                        banner
                        availableEpisodes
                    }
                }
            }
        `;

        var searchObj = { isManga: false };
        if (query) {
            searchObj.query = query;
        }

        var payload = {
            query: gqlQuery,
            variables: {
                search: searchObj,
                limit: 24,
                page: page
            }
        };

        var res = await this.client.post(this.apiUrl, this.getHeaders(), payload);
        var data = JSON.parse(res.body);

        var list = [];
        var shows = data.data && data.data.shows ? data.data.shows.edges || [] : [];

        for (var item of shows) {
            var title = item.englishName || item.name || item.nativeName || "Unknown";
            var image = item.thumbnail || item.banner || "";
            list.push({
                name: title,
                imageUrl: image,
                link: this.baseUrl + "anime/" + item._id
            });
        }

        var total = data.data && data.data.shows && data.data.shows.pageInfo ? data.data.shows.pageInfo.total || 0 : 0;
        var hasNextPage = (page * 24) < total;

        return { list: list, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        var match = url.match(/\/anime\/([a-zA-Z0-9_\-]+)/);
        if (!match) throw new Error("Invalid detail URL: " + url);
        var showId = match[1];

        var query = `
            query($_id: String!) {
                show(_id: $_id) {
                    _id
                    name
                    englishName
                    nativeName
                    description
                    thumbnail
                    banner
                    genres
                    status
                    availableEpisodesDetail
                }
            }
        `;

        var payload = {
            query: query,
            variables: { _id: showId }
        };

        var res = await this.client.post(this.apiUrl, this.getHeaders(), payload);
        var data = JSON.parse(res.body);

        if (!data.data || !data.data.show) {
            throw new Error("Show not found for ID: " + showId);
        }

        var show = data.data.show;
        var title = show.englishName || show.name || show.nativeName || "Unknown";
        var image = show.thumbnail || show.banner || "";
        var description = (show.description || "").replace(/<[^>]*>/g, '');
        var genres = show.genres || [];

        // Status: 0=Ongoing, 1=Completed, 5=Hiatus
        var status = 0;
        var statusStr = (show.status || "").toUpperCase();
        if (statusStr === "FINISHED" || statusStr === "COMPLETED") status = 1;
        else if (statusStr === "HIATUS") status = 5;

        // Parse episodes
        var chapters = [];
        var epDetail = show.availableEpisodesDetail || {};
        var subList = epDetail.sub || epDetail.dub || epDetail.raw || [];

        for (var i = subList.length - 1; i >= 0; i--) {
            var epStr = subList[i];
            chapters.push({
                name: "Episode " + epStr,
                url: this.baseUrl + "anime/" + showId + "/" + epStr,
                dateUpload: null
            });
        }

        return {
            name: title,
            imageUrl: image,
            description: description,
            genre: genres,
            status: status,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        try {
            var match = url.match(/\/anime\/([a-zA-Z0-9_\-]+)\/([a-zA-Z0-9_\-.]+)/);
            if (!match) return [];

            var showId = match[1];
            var epStr = match[2];
            var epNum = parseFloat(epStr);
            if (isNaN(epNum)) epNum = 1;

            var query = `
                query($showId: String!, $episodeNumStart: Float!, $episodeNumEnd: Float!) {
                    episodeInfos(showId: $showId, episodeNumStart: $episodeNumStart, episodeNumEnd: $episodeNumEnd) {
                        episodeIdNum
                        vidInforssub
                        vidInforsdub
                        vidInforsraw
                    }
                }
            `;

            var payload = {
                query: query,
                variables: {
                    showId: showId,
                    episodeNumStart: epNum,
                    episodeNumEnd: epNum
                }
            };

            var res = await this.client.post(this.apiUrl, this.getHeaders(), payload);
            if (!res || !res.body) return [];
            var data = JSON.parse(res.body);

            var videos = [];

            // Add Web Embed Players (Bypasses Cloudflare block on direct MP4 paths)
            videos.push({
                url: "https://allanime.day/embed?animeiframe=" + showId + "/sub/" + epStr,
                originalUrl: "https://allanime.day/embed?animeiframe=" + showId + "/sub/" + epStr,
                quality: "Embed Player (AllAnime Sub)",
                subtitles: [],
                headers: this.getStreamHeaders()
            });

            videos.push({
                url: "https://allanime.day/embed?animeiframe=" + showId + "/dub/" + epStr,
                originalUrl: "https://allanime.day/embed?animeiframe=" + showId + "/dub/" + epStr,
                quality: "Embed Player (AllAnime Dub)",
                subtitles: [],
                headers: this.getStreamHeaders()
            });

            var infos = data && data.data && data.data.episodeInfos ? data.data.episodeInfos : [];

            // Primary media CDN servers for YouTube-Anime video paths
            var cdnServers = [
                { name: "ALN Server", host: "https://aln.youtube-anime.com" },
                { name: "WP Server", host: "https://wp.youtube-anime.com" },
                { name: "AIMG Server", host: "https://aimgf.youtube-anime.com" },
                { name: "YTIMG Server", host: "https://ytimgf.youtube-anime.com" }
            ];

            for (var info of infos) {
                // Sub Video
                if (info.vidInforssub && info.vidInforssub.vidPath) {
                    var subPath = info.vidInforssub.vidPath;
                    var subRes = info.vidInforssub.vidResolution || 1080;
                    for (var s of cdnServers) {
                        var subUrl = subPath.startsWith("http") ? subPath : (s.host + subPath);
                        videos.push({
                            url: subUrl,
                            originalUrl: subUrl,
                            quality: "Sub - " + subRes + "p (" + s.name + ")",
                            subtitles: [],
                            headers: this.getStreamHeaders()
                        });
                    }
                }

                // Dub Video
                if (info.vidInforsdub && info.vidInforsdub.vidPath) {
                    var dubPath = info.vidInforsdub.vidPath;
                    var dubRes = info.vidInforsdub.vidResolution || 1080;
                    for (var s of cdnServers) {
                        var dubUrl = dubPath.startsWith("http") ? dubPath : (s.host + dubPath);
                        videos.push({
                            url: dubUrl,
                            originalUrl: dubUrl,
                            quality: "Dub - " + dubRes + "p (" + s.name + ")",
                            subtitles: [],
                            headers: this.getStreamHeaders()
                        });
                    }
                }

                // Raw Video
                if (info.vidInforsraw && info.vidInforsraw.vidPath) {
                    var rawPath = info.vidInforsraw.vidPath;
                    var rawRes = info.vidInforsraw.vidResolution || 1080;
                    for (var s of cdnServers) {
                        var rawUrl = rawPath.startsWith("http") ? rawPath : (s.host + rawPath);
                        videos.push({
                            url: rawUrl,
                            originalUrl: rawUrl,
                            quality: "Raw - " + rawRes + "p (" + s.name + ")",
                            subtitles: [],
                            headers: this.getStreamHeaders()
                        });
                    }
                }
            }

            return videos;
        } catch (err) {
            console.log("Error in getVideoList: " + err.message);
            return [];
        }
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [];
    }
}

