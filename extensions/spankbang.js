const mangayomiSources = [{
    "name": "SpankBang",
    "lang": "en",
    "baseUrl": "https://spankbang.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=spankbang.com",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.1.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": true,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/mangayomi-extensionstet2/main/javascript/anime/src/en/working/spankbang.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 88880008,
    "notes": "SpankBang extension for video streaming",
    "pkgPath": "anime/src/en/working/spankbang.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://spankbang.com";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
            "Referer": this.baseUrl + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
        };
    }

    async getPopular(page) {
        return await this.search("", page, []);
    }

    async getLatestUpdates(page) {
        const url = `${this.baseUrl}/new_videos/${page}/`;
        return await this.parseList(url);
    }

    async search(query, page, filters) {
        let category = "";
        if (filters && filters.length > 0) {
            for (const filter of filters) {
                if (filter.name === "Categories" && filter.values) {
                    category = filter.values[filter.state || 0].value;
                }
            }
        }

        let url = "";
        if (query && query.trim() !== "") {
            url = `${this.baseUrl}/s/${encodeURIComponent(query)}/${page}/`;
        } else if (category) {
            url = `${this.baseUrl}/s/${category}/${page}/`;
        } else {
            url = `${this.baseUrl}/most_popular/${page}/?p=w`;
        }

        return await this.parseList(url);
    }

    async parseList(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const videos = [];

        const elements = doc.select(".js-video-item");
        for (const el of elements) {
            const linkEl = el.selectFirst("a.relative, a[href*='/video/']");
            const titleEl = el.selectFirst(".line-clamp-2, a:not(.relative)");
            const imgEl = el.selectFirst("img");

            if (linkEl && imgEl) {
                const href = linkEl.attr("href");
                const name = (titleEl ? titleEl.text : imgEl.attr("alt")) || "No Title";
                const imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || "";

                if (href && name) {
                    videos.push({
                        name: name.trim(),
                        imageUrl: imageUrl,
                        link: href.startsWith("http") ? href : this.baseUrl + href
                    });
                }
            }
        }

        return {
            list: videos,
            hasNextPage: doc.selectFirst("li.next, a.next") !== null || videos.length >= 20
        };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const title = doc.selectFirst("h1")?.text.trim() || "";
        const image = doc.selectFirst("video")?.attr("poster") || doc.selectFirst("meta[property='og:image']")?.attr("content") || "";
        const description = doc.selectFirst(".description, .video-description")?.text.trim() || "SpankBang Video";

        return {
            name: title,
            imageUrl: image,
            description: description,
            episodes: [{
                name: "Play Video",
                url: url
            }]
        };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders());
        const body = res.body;
        const videos = [];
        const streamDataMatch = body.match(/var\s+stream_data\s*=\s*({.+?});/);
        
        if (streamDataMatch) {
            try {
                let jsonStr = streamDataMatch[1].replace(/'/g, '"');
                const streamData = JSON.parse(jsonStr);
                for (const quality in streamData) {
                    const data = streamData[quality];
                    if (data && data.length > 0) {
                        videos.push({
                            url: data[0],
                            originalUrl: data[0],
                            quality: quality
                        });
                    }
                }
            } catch (e) {
                const qualities = ["240p", "320p", "480p", "720p", "1080p", "4k"];
                for (const q of qualities) {
                    const qRegex = new RegExp(`"${q}"\\s*:\\s*\\[\\s*"([^"]+)"`, "i");
                    const qMatch = body.replace(/'/g, '"').match(qRegex);
                    if (qMatch) {
                        videos.push({
                            url: qMatch[1],
                            originalUrl: qMatch[1],
                            quality: q
                        });
                    }
                }
            }
        }

        if (videos.length === 0) {
            const mp4Match = body.match(/https?:\/\/[^"']+\.mp4[^"']*/g);
            if (mp4Match) {
                const uniqueMp4s = [...new Set(mp4Match)];
                for (const mp4 of uniqueMp4s) {
                    videos.push({
                        url: mp4,
                        originalUrl: mp4,
                        quality: "HD"
                    });
                }
            }
        }

        return videos;
    }

    async getPageList(url) { return []; }

    getFilterList() {
        return [{
            type_name: "SelectFilter",
            name: "Categories",
            state: 0,
            values: [
                { type_name: "SelectOption", name: "All", value: "" },
                { type_name: "SelectOption", name: "Asian", value: "asian" },
                { type_name: "SelectOption", name: "Amateur", value: "amateur" },
                { type_name: "SelectOption", name: "Japanese", value: "japanese" },
                { type_name: "SelectOption", name: "Creampie", value: "creampie" },
                { type_name: "SelectOption", name: "Mature", value: "mature" },
                { type_name: "SelectOption", name: "Anal", value: "anal" },
                { type_name: "SelectOption", name: "Blowjob", value: "blowjob" },
                { type_name: "SelectOption", name: "Milf", value: "milf" },
                { type_name: "SelectOption", name: "Ebony", value: "ebony" },
                { type_name: "SelectOption", name: "Teen", value: "teen" },
                { type_name: "SelectOption", name: "POV", value: "pov" },
                { type_name: "SelectOption", name: "Hairy", value: "hairy" }
            ]
        }];
    }
}

var extension = new DefaultExtension();
