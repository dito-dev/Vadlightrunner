const mangayomiSources = [{
    "name": "AniDoor",
    "lang": "en",
    "baseUrl": "https://anidoor.me",
    "apiUrl": "https://graphql.anilist.co",
    "iconUrl": "https://anidoor.me/favicon.ico",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.6",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/mangayomi-extensionstet2/main/javascript/anime/src/en/working/anidoor.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 1029384756,
    "notes": "AniDoor anime streaming using AniList GraphQL for metadata and discovery.",
    "pkgPath": "anime/src/en/working/anidoor.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://anidoor.me";
        this.apiUrl = "https://graphql.anilist.co";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Content-Type": "application/json"
        };
    }

    async ql(query, variables = {}) {
        const res = await this.client.post(this.apiUrl, this.getHeaders(), {
            query: query,
            variables: variables
        });
        const json = JSON.parse(res.body);
        if (json.errors) throw new Error(json.errors[0].message);
        return json.data;
    }

    async getPopular(page) {
        const query = `query($page:Int){Page(page:$page,perPage:20){media(type:ANIME,sort:TRENDING_DESC,status_in:[RELEASING,FINISHED]){id title{english romaji}coverImage{large}}}}`;
        const data = await this.ql(query, { page: parseInt(page) });
        const list = data.Page.media.map(m => ({
            name: m.title.english || m.title.romaji,
            imageUrl: m.coverImage.large,
            link: `https://anidoor.me/info/?al=${m.id}`
        }));
        return { list: list, hasNextPage: list.length === 20 };
    }

    async getLatestUpdates(page) {
        const query = `query($page:Int){Page(page:$page,perPage:20){media(type:ANIME,sort:UPDATED_AT_DESC,status:RELEASING){id title{english romaji}coverImage{large}}}}`;
        const data = await this.ql(query, { page: parseInt(page) });
        const list = data.Page.media.map(m => ({
            name: m.title.english || m.title.romaji,
            imageUrl: m.coverImage.large,
            link: `https://anidoor.me/info/?al=${m.id}`
        }));
        return { list: list, hasNextPage: list.length === 20 };
    }

    async search(query, page, filters) {
        const gqlQuery = `query($page:Int,$search:String){Page(page:$page,perPage:20){media(type:ANIME,search:$search){id title{english romaji}coverImage{large}}}}`;
        const data = await this.ql(gqlQuery, { page: parseInt(page), search: query });
        const list = data.Page.media.map(m => ({
            name: m.title.english || m.title.romaji,
            imageUrl: m.coverImage.large,
            link: `https://anidoor.me/info/?al=${m.id}`
        }));
        return { list: list, hasNextPage: list.length === 20 };
    }

    async getDetail(url) {
        if (!url) return { name: "Unknown", imageUrl: "", description: "", genre: [], status: 0, chapters: [] };
        const alIdMatch = url.match(/[?&]al=(\d+)/);
        if (!alIdMatch) throw new Error("Invalid URL: missing alId");
        const alId = parseInt(alIdMatch[1]);
        const query = `query($id:Int){Media(id:$id,type:ANIME){id idMal title{english romaji native}description(asHtml:false)coverImage{extraLarge large}bannerImage averageScore season seasonYear episodes status genres nextAiringEpisode{episode}}}`;
        const data = await this.ql(query, { id: alId });
        const m = data.Media;

        const chapters = [];
        const totalEps = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : 0) || 12;
        
        for (let i = totalEps; i >= 1; i--) {
            chapters.push({
                name: `Episode ${i}`,
                url: `https://anidoor.me/watch/?al=${m.id}&e=${i}`
            });
        }

        return {
            name: m.title.english || m.title.romaji,
            imageUrl: m.coverImage.extraLarge || m.coverImage.large,
            description: m.description ? m.description.replace(/<[^>]*>/g, '') : "",
            genre: m.genres,
            status: m.status === "FINISHED" ? 1 : 0,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        console.log("AniDoor getVideoList: " + url);
        if (!url || typeof url !== 'string') {
            return [];
        }

        const alIdMatch = url.match(/[?&]al=(\d+)/);
        const epNumMatch = url.match(/[?&]e=(\d+)/);
        
        if (!alIdMatch) {
            console.log("AniDoor: Could not extract alId from URL: " + url);
            return [];
        }

        const alId = alIdMatch[1];
        const epNum = epNumMatch ? epNumMatch[1] : "1";
        const type = new SharedPreferences().get("stream_type") || "sub";

        const videos = [];
        const commonHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        };

        // 1. TryEmbed API (Primary Source)
        try {
            const tryembedApiUrl = `https://tryembed.us.cc/api/stream_data?id=${alId}&episode=${epNum}&audio=${type}`;
            const res = await this.client.get(tryembedApiUrl, {
                ...commonHeaders,
                "Referer": `https://tryembed.us.cc/embed/anime/${alId}/${epNum}/${type}`
            });
            const data = JSON.parse(res.body);
            
            // Extract Subtitles
            const subtitles = [];
            if (data.captions && Array.isArray(data.captions)) {
                for (const cap of data.captions) {
                    subtitles.push({
                        label: cap.label,
                        file: cap.url
                    });
                }
            }

            if (data.providers && Array.isArray(data.providers)) {
                for (const provider of data.providers) {
                    if (provider.qualities && Array.isArray(provider.qualities)) {
                        for (const quality of provider.qualities) {
                            // The token redirects to the actual m3u8.
                            // We return the redirect URL but with correct headers.
                            const videoUrl = `https://tryembed.us.cc/s/${quality.token}`;
                            videos.push({
                                url: videoUrl,
                                originalUrl: videoUrl,
                                quality: `TryEmbed - ${provider.name} ${quality.name}`,
                                subtitles: subtitles,
                                headers: { 
                                    "Referer": "https://tryembed.us.cc/",
                                    ...commonHeaders
                                }
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.log("AniDoor TryEmbed extraction error: " + e);
        }

        // 2. VidNest Fallback (Encrypted or Scraped)
        const vidnestUrl = `https://vidnest.fun/animepahe/${alId}/${epNum}/${type}`;
        try {
            const res = await this.client.get(vidnestUrl, {
                ...commonHeaders,
                "Referer": "https://anidoor.me/"
            });
            
            // Simple regex for any potential m3u8 links in scripts/HTML
            const m3u8Regex = /"(https?:\/\/[^"]+\.m3u8[^"]*)"/g;
            let match;
            while ((match = m3u8Regex.exec(res.body)) !== null) {
                const link = match[1];
                if (!videos.some(v => v.url === link)) {
                    videos.push({
                        url: link,
                        originalUrl: link,
                        quality: `VidNest (${type.toUpperCase()})`,
                        headers: { 
                            "Referer": "https://vidnest.fun/",
                            "Origin": "https://vidnest.fun",
                            ...commonHeaders
                        }
                    });
                }
            }
        } catch (e) {
            console.log("AniDoor VidNest extraction error: " + e);
        }

        return videos;
    }

    async getPageList(url) { return []; }
    getFilterList() { return []; }
    getSourcePreferences() {
        return [
            {
                key: "stream_type",
                listPreference: {
                    title: "Preferred Type",
                    summary: "Prefer subtitled (sub) or dubbed (dub) audio",
                    valueIndex: 0,
                    entries: ["Sub", "Dub"],
                    entryValues: ["sub", "dub"]
                }
            }
        ];
    }
}
