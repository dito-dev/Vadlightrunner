const mangayomiSources = [
    {
        "name": "VidNest (Anime)",
        "lang": "en",
        "baseUrl": "https://vidnest.fun",
        "apiUrl": "https://graphql.anilist.co",
        "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=vidnest.fun",
        "typeSource": "single",
        "isManga": false,
        "itemType": 1,
        "version": "0.0.2",
        "dateFormat": "",
        "dateFormatLocale": "",
        "isNsfw": false,
        "hasCloudflare": false,
        "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/vidnest.js",
        "isFullData": false,
        "appMinVerReq": "0.5.0",
        "additionalParams": "",
        "sourceCodeLanguage": 1,
        "id": 732918451,
        "notes": "VidNest Anime player",
        "pkgPath": "working/vidnest.js"
    }
];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.apiUrl = "https://graphql.anilist.co";
        this.baseUrl = "https://vidnest.fun";
        this.apiBaseUrl = "https://new.vidnest.fun";
        this.decryptionKey = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";
        this.tmdbApiKey = "a711d702d374147c600b57419a1f8cda";
        this.animeListsCdn = "https://cdn.jsdelivr.net/gh/Fribb/anime-lists@master/anime-list-reduced.json";
        this._animeListsCache = null;
        this._tmdbMappingCache = {};
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Content-Type": "application/json"
        };
    }

    async gqlGet(query, variables) {
        var headers = this.getHeaders();
        var bodyObj = { query: query, variables: variables };
        var res = await this.client.post(this.apiUrl, headers, bodyObj);
        
        if (res.statusCode !== 200) {
            console.log("gqlGet error: " + res.statusCode + " " + res.body);
            throw new Error("GraphQL request failed: " + res.statusCode);
        }
        
        return JSON.parse(res.body);
    }

    pickTitle(show) {
        return show.title.english || show.title.romaji || show.title.native || "";
    }

    parseShowList(mediaList) {
        var list = [];
        for (var edge of mediaList) {
            var title = this.pickTitle(edge);
            if (!title) continue;
            
            var imageUrl = edge.coverImage ? (edge.coverImage.extraLarge || edge.coverImage.large) : "";
            
            list.push({
                name: title,
                imageUrl: imageUrl,
                link: edge.id.toString()
            });
        }
        return list;
    }

    async getPopular(page) {
        console.log("VidNest getPopular page=" + page);
        try {
            var query = `query ($page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { hasNextPage }
                    media(type: ANIME, sort: POPULARITY_DESC) { 
                        id
                        title { romaji english native }
                        coverImage { extraLarge large }
                    }
                }
            }`;
            var variables = { page: page, perPage: 24 };
            var data = await this.gqlGet(query, variables);
            var pageInfo = data.data.Page;
            var list = this.parseShowList(pageInfo.media);
            return { list, hasNextPage: pageInfo.pageInfo.hasNextPage };
        } catch (e) {
            console.log("getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getLatestUpdates(page) {
        console.log("VidNest getLatestUpdates page=" + page);
        try {
            var query = `query ($page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { hasNextPage }
                    media(type: ANIME, sort: TRENDING_DESC) { 
                        id
                        title { romaji english native }
                        coverImage { extraLarge large }
                    }
                }
            }`;
            var variables = { page: page, perPage: 24 };
            var data = await this.gqlGet(query, variables);
            var pageInfo = data.data.Page;
            var list = this.parseShowList(pageInfo.media);
            return { list, hasNextPage: pageInfo.pageInfo.hasNextPage };
        } catch (e) {
            console.log("getLatestUpdates error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async search(query, page, filters) {
        console.log("VidNest search: " + query + " page=" + page);
        try {
            var gql = `query ($page: Int, $perPage: Int, $search: String) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { hasNextPage }
                    media(type: ANIME, search: $search, sort: POPULARITY_DESC) { 
                        id
                        title { romaji english native }
                        coverImage { extraLarge large }
                    }
                }
            }`;
            var variables = { search: query, page: page, perPage: 24 };
            var data = await this.gqlGet(gql, variables);
            var pageInfo = data.data.Page;
            var list = this.parseShowList(pageInfo.media);
            return { list, hasNextPage: pageInfo.pageInfo.hasNextPage };
        } catch (e) {
            console.log("search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    // ── Fribb anime-lists mapping helpers ──────────────────────────────────

    async fetchAnimeListsMapping(anilistId) {
        if (this._tmdbMappingCache[anilistId] !== undefined) {
            return this._tmdbMappingCache[anilistId];
        }
        try {
            if (!this._animeListsCache) {
                console.log("Loading Fribb anime-lists from CDN...");
                var res = await this.client.get(this.animeListsCdn, this.getHeaders());
                if (res.statusCode === 200) {
                    this._animeListsCache = JSON.parse(res.body);
                    console.log("Loaded " + this._animeListsCache.length + " anime-lists entries");
                } else {
                    console.log("anime-lists CDN returned " + res.statusCode);
                    this._tmdbMappingCache[anilistId] = null;
                    return null;
                }
            }
            for (var entry of this._animeListsCache) {
                if (entry.anilist_id === anilistId) {
                    var tmdbObj = entry.themoviedb_id;
                    var tmdbId = null;
                    if (tmdbObj && typeof tmdbObj === 'object') {
                        tmdbId = tmdbObj.tv || tmdbObj.movie || null;
                    } else if (typeof tmdbObj === 'number') {
                        tmdbId = tmdbObj;
                    }
                    if (tmdbId && tmdbId > 0) {
                        var season = 1;
                        var seasonObj = entry.season;
                        if (seasonObj && typeof seasonObj === 'object') {
                            season = seasonObj.tmdb || 1;
                        } else if (typeof seasonObj === 'number') {
                            season = seasonObj;
                        }
                        var mapping = { tmdb_id: tmdbId, season: season };
                        this._tmdbMappingCache[anilistId] = mapping;
                        console.log("Mapped AniList " + anilistId + " → TMDB " + tmdbId + " (season " + season + ")");
                        return mapping;
                    }
                }
            }
        } catch (e) {
            console.log("fetchAnimeListsMapping error: " + e);
        }
        this._tmdbMappingCache[anilistId] = null;
        return null;
    }

    async fetchTmdbEpisodeCount(tmdbId, season) {
        try {
            var url = "https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season + "?api_key=" + this.tmdbApiKey;
            var res = await this.client.get(url, this.getHeaders());
            if (res.statusCode === 200) {
                var data = JSON.parse(res.body);
                if (data.episodes && data.episodes.length > 0) {
                    return data.episodes.length;
                }
            }
        } catch (e) {
            console.log("fetchTmdbEpisodeCount error: " + e);
        }
        return 0;
    }

    // ── VidNest TV stream endpoint ────────────────────────────────────────

    async fetchVidNestTV(tmdbId, season, episode) {
        var fetchUrl = this.apiBaseUrl + "/tv/" + tmdbId + "/" + season + "/" + episode;
        var headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Referer": "https://vidnest.fun/"
        };
        try {
            var res = await this.client.get(fetchUrl, headers);
            if (res.statusCode !== 200) {
                console.log("VidNest TV fetch failed, status=" + res.statusCode);
                return null;
            }
            var json = JSON.parse(res.body);
            if (json.encrypted && json.data) {
                var decryptedStr = this.decrypt(json.data);
                return JSON.parse(decryptedStr);
            }
            return json;
        } catch (e) {
            console.log("Error in fetchVidNestTV: " + e);
            return null;
        }
    }

    async getDetail(url) {
        console.log("VidNest getDetail: " + url);
        try {
            var showId = parseInt(url);

            var detailQuery = `query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    id
                    title { romaji english native }
                    description(asHtml: false)
                    coverImage { extraLarge large }
                    genres
                    status
                    episodes
                    nextAiringEpisode { episode }
                }
            }`;
            var detailData = await this.gqlGet(detailQuery, { id: showId });
            var show = detailData.data.Media;

            var title = this.pickTitle(show);
            var imageUrl = show.coverImage ? (show.coverImage.extraLarge || show.coverImage.large) : "";
            var description = show.description || "";
            var genre = show.genres || [];

            // Mapping status
            var status = 5; // Unknown
            if (show.status) {
                if (show.status === "RELEASING") status = 0;
                else if (show.status === "FINISHED") status = 1;
                else if (show.status === "HIATUS") status = 2;
                else if (show.status === "CANCELLED") status = 3;
                else if (show.status === "NOT_YET_RELEASED") status = 4;
            }

            // Calculate available episodes
            var epsCount = show.episodes || 0;
            if (show.status === 'RELEASING' && show.nextAiringEpisode) {
                epsCount = show.nextAiringEpisode.episode - 1;
            }

            // TMDB episode count fallback when AniList returns 0
            var tmdbMapping = null;
            if (epsCount === 0) {
                console.log("AniList returned 0 episodes, trying TMDB fallback...");
                tmdbMapping = await this.fetchAnimeListsMapping(showId);
                if (tmdbMapping) {
                    var tmdbCount = await this.fetchTmdbEpisodeCount(tmdbMapping.tmdb_id, tmdbMapping.season);
                    if (tmdbCount > 0) {
                        epsCount = tmdbCount;
                        console.log("TMDB fallback: found " + tmdbCount + " episodes");
                    }
                }
            }

            var chapters = [];
            // Generate episode links — encode TMDB mapping in URL for getVideoList
            for (var i = 1; i <= epsCount; i++) {
                var epUrl = showId + "||" + i;
                if (tmdbMapping) {
                    epUrl += "||" + tmdbMapping.tmdb_id + "||" + tmdbMapping.season;
                }
                chapters.push({
                    name: "Episode " + i,
                    url: epUrl
                });
            }

            // Sort episodes descending
            chapters.reverse();

            var link = this.baseUrl + "/anime/" + showId;

            console.log("getDetail: " + title + ", " + chapters.length + " episodes");

            return {
                link,
                name: title,
                imageUrl,
                description,
                genre,
                status,
                chapters
            };
        } catch (e) {
            console.log("getDetail error: " + e);
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
        }
    }

    decrypt(encryptedText) {
        var alphabet = this.decryptionKey;
        var a = {};
        for (var e = 0; e < alphabet.length; e++) {
            a[alphabet[e]] = e;
        }
        
        var i = [];
        for (var t = 0; t < encryptedText.length; t += 4) {
            var o = encryptedText.substring(t, t + 4);
            while (o.length < 4) {
                o += "=";
            }
            var d = [];
            for (var e = 0; e < 4; e++) {
                var charVal = a[o[e]];
                d.push(charVal !== undefined ? charVal : 64);
            }
            
            var b1 = (d[0] << 2) | (d[1] >> 4);
            i.push(String.fromCharCode(b1));
            if (d[2] !== 64) {
                var b2 = ((d[1] & 15) << 4) | (d[2] >> 2);
                i.push(String.fromCharCode(b2));
            }
            if (d[3] !== 64) {
                var b3 = ((d[2] & 3) << 6) | d[3];
                i.push(String.fromCharCode(b3));
            }
        }
        try {
            return decodeURIComponent(escape(i.join('')));
        } catch (err) {
            return i.join('');
        }
    }

    async fetchStreamData(anilistId, epNum, subOrDub) {
        var fetchUrl = this.apiBaseUrl + "/hianime/anime/" + anilistId + "/" + epNum + "/" + subOrDub;
        var headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Referer": "https://vidnest.fun/"
        };
        try {
            var res = await this.client.get(fetchUrl, headers);
            if (res.statusCode !== 200) {
                console.log("Failed to fetch stream data for: " + subOrDub + ", status=" + res.statusCode);
                return null;
            }
            var json = JSON.parse(res.body);
            if (json.encrypted && json.data) {
                var decryptedStr = this.decrypt(json.data);
                return JSON.parse(decryptedStr);
            }
            return json;
        } catch (e) {
            console.log("Error in fetchStreamData for " + subOrDub + ": " + e);
            return null;
        }
    }

    async getVideoList(url) {
        console.log("VidNest getVideoList: " + url + " source=VidNest (Anime)");
        try {
            var parts = url.split("||");
            if (parts.length < 2) {
                console.log("Invalid url format");
                return [];
            }
            var anilistId = parts[0];
            var epNum = parts[1];
            // TMDB mapping may be encoded in the URL from getDetail
            var tmdbId = parts.length >= 3 ? parseInt(parts[2]) : null;
            var tmdbSeason = parts.length >= 4 ? parseInt(parts[3]) : 1;

            var prefType = new SharedPreferences().get("preferred_type") || "sub";
            var primaryType = prefType === "dub" ? "dub" : "sub";
            var secondaryType = primaryType === "sub" ? "dub" : "sub";

            var data = await this.fetchStreamData(anilistId, epNum, primaryType);
            var secondaryData = null;

            // If primary type failed, or to gather all available options, fetch secondary type
            try {
                secondaryData = await this.fetchStreamData(anilistId, epNum, secondaryType);
            } catch (secErr) {
                console.log("Failed to fetch secondary type: " + secErr);
            }

            var proxyHost = "https://megacloud.animanga.fun";
            var videos = [];

            var addVideos = (streamData, labelType, sourceTag) => {
                if (!streamData || !streamData.success || !streamData.sources) return;
                
                var subtitles = [];
                if (streamData.tracks && Array.isArray(streamData.tracks)) {
                    for (var track of streamData.tracks) {
                        if (track.file && (track.kind === "captions" || track.kind === "subtitles")) {
                            var subProxyUrl = proxyHost + "/fetch?url=" + encodeURIComponent(track.file) + "&ref=" + encodeURIComponent("https://megaplay.buzz/");
                            subtitles.push({
                                file: subProxyUrl,
                                label: track.label || "Unknown"
                            });
                        }
                    }
                }

                for (var source of streamData.sources) {
                    if (source.file) {
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
                        var proxyUrl = proxyHost + "/proxy?url=" + encodeURIComponent(source.file) + "&headers=" + encodeURIComponent(JSON.stringify(streamHeaders));
                        
                        var typeLabel = labelType.toUpperCase();
                        var tag = sourceTag || "VidNest";
                        videos.push({
                            url: proxyUrl,
                            originalUrl: source.file,
                            quality: tag + " (" + typeLabel + ") - " + (source.type || "HLS"),
                            subtitles: subtitles,
                            headers: streamHeaders
                        });
                    }
                }
            };

            // Add preferred type first (HiAnime source)
            addVideos(data, primaryType, "VidNest");
            // Add fallback type second (HiAnime source)
            addVideos(secondaryData, secondaryType, "VidNest");

            // ── VidNest TV source (TMDB-based fallback/additional) ──────────
            if (!tmdbId || isNaN(tmdbId)) {
                // Try to resolve TMDB mapping if not already in URL
                try {
                    var mapping = await this.fetchAnimeListsMapping(parseInt(anilistId));
                    if (mapping) {
                        tmdbId = mapping.tmdb_id;
                        tmdbSeason = mapping.season;
                    }
                } catch (mapErr) {
                    console.log("TMDB mapping lookup failed: " + mapErr);
                }
            }

            if (tmdbId && !isNaN(tmdbId)) {
                console.log("Trying VidNest TV source: TMDB " + tmdbId + " S" + tmdbSeason + "E" + epNum);
                try {
                    var tvData = await this.fetchVidNestTV(tmdbId, tmdbSeason, epNum);
                    addVideos(tvData, "multi", "VidNest TV");
                } catch (tvErr) {
                    console.log("VidNest TV source failed: " + tvErr);
                }
            }

            console.log("Total videos resolved: " + videos.length);
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
                    title: "Preferred Stream Type",
                    summary: "Select your preferred stream type (sub or dub)",
                    valueIndex: 0,
                    entries: ["Sub", "Dub"],
                    entryValues: ["sub", "dub"]
                }
            }
        ];
    }
}
