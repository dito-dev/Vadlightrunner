const mangayomiSources = [{
    "name": "Miruro",
    "lang": "en",
    "baseUrl": "https://www.miruro.to",
    "apiUrl": "https://graphql.anilist.co",
    "iconUrl": "https://www.miruro.to/icon-light-1024x1024.png",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "1.0.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": true,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/miruro.js",
    "isFullData": true,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 1990040708,
    "notes": "Miruro anime extension powered by AniList GraphQL and Miruro Stream Engine.",
    "pkgPath": "working/miruro.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://www.miruro.to";
        this.apiUrl = "https://graphql.anilist.co";
    }

    getApiHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": "https://www.miruro.to",
            "Referer": "https://www.miruro.to/"
        };
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": "https://www.miruro.to/"
        };
    }

    getStreamHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Referer": "https://www.miruro.to/"
        };
    }

    slugify(text) {
        if (!text) return "anime";
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '') || "anime";
    }

    base64url(obj) {
        var str = JSON.stringify(obj);
        var b64 = bytesToBase64(new TextEncoder().encode(str));
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    // ── AniList GraphQL API Methods ──

    async getPopular(page) {
        var query = `
        query ($page: Int) {
          Page(page: $page, perPage: 20) {
            pageInfo { hasNextPage }
            media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
              id
              title { userPreferred romaji english }
              coverImage { extraLarge large }
            }
          }
        }`;

        var body = JSON.stringify({ query: query, variables: { page: page || 1 } });
        var res = await this.client.post(this.apiUrl, this.getApiHeaders(), body);
        var json = JSON.parse(res.body);

        var list = [];
        var mediaList = json.data?.Page?.media || [];
        for (var item of mediaList) {
            var title = item.title?.userPreferred || item.title?.english || item.title?.romaji || "Unknown";
            var cover = item.coverImage?.extraLarge || item.coverImage?.large || "";
            var link = this.baseUrl + "/info/" + item.id + "/" + this.slugify(title);
            list.push({
                name: title,
                imageUrl: cover,
                link: link
            });
        }

        var hasNextPage = json.data?.Page?.pageInfo?.hasNextPage || false;
        return { list: list, hasNextPage: hasNextPage };
    }

    async getLatestUpdates(page) {
        var query = `
        query ($page: Int) {
          Page(page: $page, perPage: 20) {
            pageInfo { hasNextPage }
            media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
              id
              title { userPreferred romaji english }
              coverImage { extraLarge large }
            }
          }
        }`;

        var body = JSON.stringify({ query: query, variables: { page: page || 1 } });
        var res = await this.client.post(this.apiUrl, this.getApiHeaders(), body);
        var json = JSON.parse(res.body);

        var list = [];
        var mediaList = json.data?.Page?.media || [];
        for (var item of mediaList) {
            var title = item.title?.userPreferred || item.title?.english || item.title?.romaji || "Unknown";
            var cover = item.coverImage?.extraLarge || item.coverImage?.large || "";
            var link = this.baseUrl + "/info/" + item.id + "/" + this.slugify(title);
            list.push({
                name: title,
                imageUrl: cover,
                link: link
            });
        }

        var hasNextPage = json.data?.Page?.pageInfo?.hasNextPage || false;
        return { list: list, hasNextPage: hasNextPage };
    }

    async search(query, page, filters) {
        var gqlQuery = `
        query ($query: String, $page: Int, $sort: [MediaSort], $genres: [String], $status: MediaStatus) {
          Page(page: $page, perPage: 20) {
            pageInfo { hasNextPage }
            media(search: $query, sort: $sort, genre_in: $genres, status: $status, type: ANIME, isAdult: false) {
              id
              title { userPreferred romaji english }
              coverImage { extraLarge large }
            }
          }
        }`;

        var variables = { page: page || 1 };
        if (query && query.trim().length > 0) {
            variables.query = query.trim();
        }

        var sortVal = ["POPULARITY_DESC"];
        var genresVal = null;
        var statusVal = null;

        if (filters && filters.length > 0) {
            for (var filter of filters) {
                if (filter.type_name === "SelectFilter") {
                    var val = filter.values[filter.state]?.value;
                    if (val) {
                        if (filter.name === "Sort By") sortVal = [val];
                        else if (filter.name === "Status") statusVal = val;
                    }
                } else if (filter.type_name === "GroupFilter" && filter.name === "Genres") {
                    var selected = [];
                    for (var gf of filter.state) {
                        if (gf.state) selected.push(gf.value);
                    }
                    if (selected.length > 0) genresVal = selected;
                }
            }
        }

        variables.sort = sortVal;
        if (genresVal) variables.genres = genresVal;
        if (statusVal) variables.status = statusVal;

        var body = JSON.stringify({ query: gqlQuery, variables: variables });
        var res = await this.client.post(this.apiUrl, this.getApiHeaders(), body);
        var json = JSON.parse(res.body);

        var list = [];
        var mediaList = json.data?.Page?.media || [];
        for (var item of mediaList) {
            var title = item.title?.userPreferred || item.title?.english || item.title?.romaji || "Unknown";
            var cover = item.coverImage?.extraLarge || item.coverImage?.large || "";
            var link = this.baseUrl + "/info/" + item.id + "/" + this.slugify(title);
            list.push({
                name: title,
                imageUrl: cover,
                link: link
            });
        }

        var hasNextPage = json.data?.Page?.pageInfo?.hasNextPage || false;
        return { list: list, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        var idMatch = url.match(/(?:info|watch)\/(\d+)/);
        var id = idMatch ? parseInt(idMatch[1]) : 0;

        if (!id) {
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
        }

        var query = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title { userPreferred romaji english }
            coverImage { extraLarge large }
            description(asHtml: false)
            genres
            status
            episodes
            nextAiringEpisode { episode }
          }
        }`;

        var body = JSON.stringify({ query: query, variables: { id: id } });
        var res = await this.client.post(this.apiUrl, this.getApiHeaders(), body);
        var json = JSON.parse(res.body);

        var media = json.data?.Media;
        if (!media) {
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
        }

        var title = media.title?.userPreferred || media.title?.english || media.title?.romaji || "Unknown Anime";
        var cover = media.coverImage?.extraLarge || media.coverImage?.large || "";
        var description = (media.description || "").replace(/<[^>]*>/g, "").trim();
        var genres = media.genres || [];

        var status = 5;
        if (media.status === "FINISHED") status = 1;
        else if (media.status === "RELEASING") status = 0;
        else if (media.status === "CANCELLED" || media.status === "HIATUS") status = 5;

        var totalEp = media.episodes;
        if (!totalEp && media.nextAiringEpisode?.episode) {
            totalEp = media.nextAiringEpisode.episode - 1;
        }
        if (!totalEp || totalEp < 1) totalEp = 12;

        var chapters = [];
        for (var i = 1; i <= totalEp; i++) {
            chapters.push({
                name: "Episode " + i,
                url: this.baseUrl + "/watch/" + id + "/" + this.slugify(title) + "?ep=" + i
            });
        }
        chapters.reverse();

        return {
            name: title,
            imageUrl: cover,
            description: description,
            genre: genres,
            status: status,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        var idMatch = url.match(/watch\/(\d+)/);
        var epMatch = url.match(/[?&]ep=(\d+)/);

        var anilistId = idMatch ? idMatch[1] : "21";
        var epNum = epMatch ? epMatch[1] : "1";

        var videos = [];
        var streamHeaders = this.getStreamHeaders();

        // 1. Try Miruro Secure Pipe API
        try {
            var payload = {
                path: "episodes",
                method: "GET",
                query: { anilistId: anilistId },
                body: null
            };
            var eParam = this.base64url(payload);
            var pipeUrl = this.baseUrl + "/api/secure/pipe?e=" + eParam;

            var res = await this.client.get(pipeUrl, this.getApiHeaders());
            if (res && res.statusCode === 200) {
                var epData = JSON.parse(res.body);
                if (Array.isArray(epData)) {
                    var targetEp = epData.find(e => String(e.number) === String(epNum)) || epData[0];
                    if (targetEp && targetEp.providers && targetEp.providers.length > 0) {
                        for (var prov of targetEp.providers) {
                            try {
                                var srcPayload = {
                                    path: "sources",
                                    method: "GET",
                                    query: {
                                        episodeId: prov.id,
                                        provider: prov.name,
                                        category: "sub",
                                        anilistId: anilistId
                                    },
                                    body: null
                                };
                                var srcParam = this.base64url(srcPayload);
                                var srcUrl = this.baseUrl + "/api/secure/pipe?e=" + srcParam;

                                var srcRes = await this.client.get(srcUrl, this.getApiHeaders());
                                if (srcRes && srcRes.statusCode === 200) {
                                    var srcData = JSON.parse(srcRes.body);
                                    var subs = [];
                                    if (srcData.subtitles && Array.isArray(srcData.subtitles)) {
                                        for (var s of srcData.subtitles) {
                                            if (s.file || s.url) {
                                                subs.push({
                                                    file: s.file || s.url,
                                                    label: s.label || s.lang || "English"
                                                });
                                            }
                                        }
                                    }

                                    if (srcData.sources && Array.isArray(srcData.sources)) {
                                        for (var srcItem of srcData.sources) {
                                            if (srcItem.url) {
                                                videos.push({
                                                    url: srcItem.url,
                                                    originalUrl: srcItem.url,
                                                    quality: "Miruro (" + (prov.name || "HD") + " " + (srcItem.quality || "Auto") + ")",
                                                    subtitles: subs,
                                                    headers: streamHeaders
                                                });
                                            }
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                }
            }
        } catch (err) {}

        // 2. Fallback to Flix API for AniList episodes if pipe API blocked
        if (videos.length === 0) {
            try {
                var flixUrl = "https://reanime.to/api/flix/" + anilistId + "/" + epNum;
                var flixRes = await this.client.get(flixUrl, this.getHeaders());
                if (flixRes && flixRes.statusCode === 200) {
                    var flixJson = JSON.parse(flixRes.body);
                    var servers = flixJson.servers || [];
                    for (var s of servers) {
                        if (s.dataLink) {
                            videos.push({
                                url: s.dataLink,
                                originalUrl: s.dataLink,
                                quality: "Miruro (" + (s.serverName || "HD") + " " + (s.dataType || "Sub").toUpperCase() + ")",
                                subtitles: [
                                    { file: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg", label: "English" }
                                ],
                                headers: streamHeaders
                            });
                        }
                    }
                }
            } catch (err) {}
        }

        // 3. Fallback to Miruro Stream Direct Player
        if (videos.length === 0) {
            videos.push({
                url: "https://www.miruro.to/watch/" + anilistId + "/anime?ep=" + epNum,
                originalUrl: "https://www.miruro.to/watch/" + anilistId + "/anime?ep=" + epNum,
                quality: "Miruro HD Player (Web)",
                subtitles: [],
                headers: streamHeaders
            });
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
                    { type_name: "SelectOption", name: "Popularity", value: "POPULARITY_DESC" },
                    { type_name: "SelectOption", name: "Trending", value: "TRENDING_DESC" },
                    { type_name: "SelectOption", name: "Score", value: "SCORE_DESC" },
                    { type_name: "SelectOption", name: "Favorites", value: "FAVOURITES_DESC" },
                    { type_name: "SelectOption", name: "Title (A-Z)", value: "TITLE_ROMAJI" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Ongoing", value: "RELEASING" },
                    { type_name: "SelectOption", name: "Completed", value: "FINISHED" },
                    { type_name: "SelectOption", name: "Upcoming", value: "NOT_YET_RELEASED" },
                    { type_name: "SelectOption", name: "Cancelled", value: "CANCELLED" }
                ]
            },
            {
                type_name: "GroupFilter",
                name: "Genres",
                state: [
                    { type_name: "CheckBox", name: "Action", value: "Action", state: false },
                    { type_name: "CheckBox", name: "Adventure", value: "Adventure", state: false },
                    { type_name: "CheckBox", name: "Comedy", value: "Comedy", state: false },
                    { type_name: "CheckBox", name: "Drama", value: "Drama", state: false },
                    { type_name: "CheckBox", name: "Ecchi", value: "Ecchi", state: false },
                    { type_name: "CheckBox", name: "Fantasy", value: "Fantasy", state: false },
                    { type_name: "CheckBox", name: "Horror", value: "Horror", state: false },
                    { type_name: "CheckBox", name: "Mahou Shoujo", value: "Mahou Shoujo", state: false },
                    { type_name: "CheckBox", name: "Mecha", value: "Mecha", state: false },
                    { type_name: "CheckBox", name: "Music", value: "Music", state: false },
                    { type_name: "CheckBox", name: "Mystery", value: "Mystery", state: false },
                    { type_name: "CheckBox", name: "Psychological", value: "Psychological", state: false },
                    { type_name: "CheckBox", name: "Romance", value: "Romance", state: false },
                    { type_name: "CheckBox", name: "Sci-Fi", value: "Sci-Fi", state: false },
                    { type_name: "CheckBox", name: "Slice of Life", value: "Slice of Life", state: false },
                    { type_name: "CheckBox", name: "Sports", value: "Sports", state: false },
                    { type_name: "CheckBox", name: "Supernatural", value: "Supernatural", state: false },
                    { type_name: "CheckBox", name: "Thriller", value: "Thriller", state: false }
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
                    valueIndex: 1,
                    entries: ["360p", "720p", "1080p", "4K"],
                    entryValues: ["360", "720", "1080", "2160"]
                }
            },
            {
                key: "preferred_audio",
                listPreference: {
                    title: "Preferred Audio",
                    summary: "Select subtitle or dubbed audio",
                    valueIndex: 0,
                    entries: ["Sub", "Dub"],
                    entryValues: ["sub", "dub"]
                }
            }
        ];
    }
}
