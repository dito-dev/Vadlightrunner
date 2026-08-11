const mangayomiSources = [{
    "name": "XNXX",
    "lang": "en",
    "baseUrl": "https://www.xnxx.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=xnxx.com",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.6",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/xnxx.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 88880009,
    "notes": "XNXX extension for video streaming",
    "pkgPath": "nsfw/xnxx.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://www.xnxx.com";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9"
        };
    }

    async getPopular(page) {
        const url = `${this.baseUrl}/hits/${page - 1}`;
        return await this.parseList(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.baseUrl}/best/${page - 1}`;
        return await this.parseList(url);
    }

    async search(query, page, filters) {
        let url = "";
        if (query === "") {
            let category = "";
            for (const filter of filters) {
                if (filter.name === "Category") {
                    category = filter.values[filter.state].value;
                }
            }

            if (category) {
                url = `${this.baseUrl}/search/${category}`;
            } else {
                url = `${this.baseUrl}/hits`;
            }
        } else {
            url = `${this.baseUrl}/search/${encodeURIComponent(query)}`;
        }
        
        if (page > 1) {
            url += `/${page - 1}`;
        }
        
        return await this.parseList(url);
    }

    async parseList(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const videos = [];

        const elements = doc.select(".thumb-block");
        for (const el of elements) {
            // Skip categories or ads
            const className = el.attr("class") || "";
            const id = el.attr("id") || "";
            if (className.includes("thumb-cat") || id.startsWith("tb_cat")) continue;

            // Robust title selection: look for the first link that looks like a video link and is not the thumbnail link
            let titleEl = el.selectFirst(".thumb-under a[href*='/video-']");
            if (!titleEl) {
                titleEl = el.selectFirst("a[href*='/video-']:not(.thumb-link)");
            }
            if (!titleEl) {
                titleEl = el.selectFirst(".thumb-under p a") || el.selectFirst(".thumb-under a");
            }

            const imgEl = el.selectFirst(".thumb img") || el.selectFirst("img");

            if (titleEl && imgEl) {
                const href = titleEl.attr("href");
                const name = titleEl.attr("title") || titleEl.text || "Video";
                const imageUrl = imgEl.attr("data-src") || imgEl.attr("src") || "";

                if (href && href.includes("/video-")) {
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
            hasNextPage: videos.length >= 20
        };
    }

    async getDetail(url) {
        url = url.trim().replace(/^["']|["']$/g, "");
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const title = doc.selectFirst("meta[property='og:title']")?.attr("content") || doc.selectFirst("h2")?.text || "";
        const image = doc.selectFirst("meta[property='og:image']")?.attr("content") || "";
        const description = doc.selectFirst("meta[property='og:description']")?.attr("content") || "XNXX Video";

        return {
            name: title.trim(),
            imageUrl: image,
            description: description,
            episodes: [{
                name: "Play Video",
                url: url
            }]
        };
    }

    async getVideoList(url) {
        url = url.trim().replace(/^["']|["']$/g, "");
        const res = await this.client.get(url, this.getHeaders());
        const body = res.body;
        const videos = [];

        // HLS
        const hlsMatch = body.match(/html5player\.setVideoHLS\s*\(\s*['"]([^'"]+)['"]/);
        if (hlsMatch) {
            videos.push({
                url: hlsMatch[1],
                originalUrl: hlsMatch[1],
                quality: "HLS"
            });
        }

        // High
        const highMatch = body.match(/html5player\.setVideoUrlHigh\s*\(\s*['"]([^'"]+)['"]/);
        if (highMatch) {
            videos.push({
                url: highMatch[1],
                originalUrl: highMatch[1],
                quality: "High"
            });
        }

        // Low
        const lowMatch = body.match(/html5player\.setVideoUrlLow\s*\(\s*['"]([^'"]+)['"]/);
        if (lowMatch) {
            videos.push({
                url: lowMatch[1],
                originalUrl: lowMatch[1],
                quality: "Low"
            });
        }

        return videos;
    }

    async getPageList(url) { return []; }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Default", value: "" },
                    { type_name: "SelectOption", name: "Hits", value: "hits" },
                    { type_name: "SelectOption", name: "Random", value: "random" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Period",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Ever", value: "" },
                    { type_name: "SelectOption", name: "Year", value: "year" },
                    { type_name: "SelectOption", name: "Month", value: "month" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Category",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Family", value: "familial_relations" },
                    { type_name: "SelectOption", name: "Pinay", value: "pinay" },
                    { type_name: "SelectOption", name: "Teen", value: "teen" },
                    { type_name: "SelectOption", name: "Hardcore", value: "hardcore" },
                    { type_name: "SelectOption", name: "Creampie", value: "creampie" },
                    { type_name: "SelectOption", name: "Asian", value: "asian_woman" },
                    { type_name: "SelectOption", name: "Big Cock", value: "big_cock" },
                    { type_name: "SelectOption", name: "Milf", value: "milf" },
                    { type_name: "SelectOption", name: "Sex", value: "sex" },
                    { type_name: "SelectOption", name: "Filipina", value: "filipina" },
                    { type_name: "SelectOption", name: "Sexy Girls", value: "sexy" },
                    { type_name: "SelectOption", name: "Gangbang", value: "gangbang" }
                ]
            }
        ];
    }
}

var extension = new DefaultExtension();
