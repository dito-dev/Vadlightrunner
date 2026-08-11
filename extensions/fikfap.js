const mangayomiSources = [{
    "name": "FikFap",
    "lang": "en",
    "baseUrl": "https://fikfap.com",
    "apiUrl": "https://api.fikfap.com",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=fikfap.com",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/fikfap.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 88880020,
    "notes": "FikFap short-form vertical video extension",
    "pkgPath": "nsfw/fikfap.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this._baseUrl = "https://fikfap.com";
        this._apiUrl = "https://api.fikfap.com";
        this._anonId = null;
    }

    // ── Anonymous Auth ────────────────────────────────────────────────────────

    getAnonId() {
        if (!this._anonId) {
            try {
                const stored = new SharedPreferences().get("anonId");
                if (stored && stored.trim() !== "") {
                    this._anonId = stored.trim();
                    return this._anonId;
                }
            } catch (e) {}
            // Generate a new UUID v4
            this._anonId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
            });
            try {
                new SharedPreferences().set("anonId", this._anonId);
            } catch (e) {}
        }
        return this._anonId;
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Authorization-Anonymous": this.getAnonId(),
            "IsLoggedIn": "false",
            "IsPWA": "false",
            "Origin": "https://fikfap.com",
            "Referer": "https://fikfap.com/"
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    mapPost(post) {
        const username = post.author ? post.author.username : "unknown";
        // Encode the postId + username so we can reconstruct for getVideoList
        const link = `${this._apiUrl}/posts/${post.postId}||${username}`;
        return {
            name: (post.label || "").trim() || `Post #${post.postId}`,
            imageUrl: post.thumbnailStreamUrl || "",
            link: link
        };
    }

    // ── Main Methods ──────────────────────────────────────────────────────────

    async getPopular(page) {
        // Use a page-based offset: page 1 = offset 0, page 2 = offset 20, etc.
        const amount = 20;
        const offset = (page - 1) * amount;
        let url = `${this._apiUrl}/posts?amount=${amount}&offset=${offset}`;

        const sort = (() => {
            try { return new SharedPreferences().get("sortOrder") || ""; } catch(e) { return ""; }
        })();
        const orientation = (() => {
            try { return new SharedPreferences().get("sexualOrientation") || ""; } catch(e) { return ""; }
        })();

        if (sort) url += `&sort=${sort}`;
        if (orientation) url += `&sexualOrientation=${orientation}`;

        const res = await this.client.get(url, this.getHeaders());
        const posts = JSON.parse(res.body);

        if (!Array.isArray(posts)) return { list: [], hasNextPage: false };

        return {
            list: posts.map(p => this.mapPost(p)),
            hasNextPage: posts.length >= amount
        };
    }

    async getLatestUpdates(page) {
        // Latest = newest posts, use default sort (already newest-first)
        const amount = 20;
        const offset = (page - 1) * amount;
        const url = `${this._apiUrl}/posts?amount=${amount}&offset=${offset}&sort=new`;
        const res = await this.client.get(url, this.getHeaders());
        const posts = JSON.parse(res.body);

        if (!Array.isArray(posts)) return { list: [], hasNextPage: false };

        return {
            list: posts.map(p => this.mapPost(p)),
            hasNextPage: posts.length >= amount
        };
    }

    async search(query, page, filters) {
        const amount = 20;
        const offset = (page - 1) * amount;

        let sort = "";
        let orientation = "";
        let tag = "";

        if (filters && filters.length > 0) {
            for (const filter of filters) {
                const idx = filter.state || 0;
                if (filter.name === "Sort By" && filter.values) sort = filter.values[idx].value;
                if (filter.name === "Sexual Orientation" && filter.values) orientation = filter.values[idx].value;
                if (filter.name === "Category / Tag" && filter.values) tag = filter.values[idx].value;
            }
        }

        let url;
        if (query && query.trim() !== "") {
            // Text search takes priority
            url = `${this._apiUrl}/search?q=${encodeURIComponent(query.trim())}&type=posts&amount=${amount}&offset=${offset}`;
            if (sort) url += `&sort=${sort}`;
            if (orientation) url += `&sexualOrientation=${orientation}`;
        } else if (tag) {
            // Browse by tag (uses search endpoint with the tag label as the query)
            url = `${this._apiUrl}/search?q=${encodeURIComponent(tag)}&type=posts&amount=${amount}&offset=${offset}`;
            if (sort) url += `&sort=${sort}`;
            if (orientation) url += `&sexualOrientation=${orientation}`;
        } else {
            // No query or tag — fall back to popular feed with sort/orientation
            return await this.getPopular(page);
        }

        const res = await this.client.get(url, this.getHeaders());
        let data;
        try { data = JSON.parse(res.body); } catch(e) { return { list: [], hasNextPage: false }; }

        // Search endpoint returns { posts: [...] }
        const posts = Array.isArray(data) ? data : (data.posts || []);

        return {
            list: posts.map(p => this.mapPost(p)),
            hasNextPage: posts.length >= amount
        };
    }

    async getDetail(url) {
        // URL format: https://api.fikfap.com/posts/POSTID||username
        const parts = url.split("||");
        const apiUrl = parts[0];
        const username = parts[1] || "unknown";

        const res = await this.client.get(apiUrl, this.getHeaders());
        let post;
        try { post = JSON.parse(res.body); } catch(e) { post = {}; }

        const title = (post.label || "").trim() || `Post #${post.postId || ""}`;
        const image = post.thumbnailStreamUrl || "";
        const tags = (post.hashtags || []).map(h => `#${h.label}`).join(" ");
        const description = [
            `By: @${username}`,
            tags ? `Tags: ${tags}` : ""
        ].filter(Boolean).join("\n");

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
        // URL format: https://api.fikfap.com/posts/POSTID||username
        const apiUrl = url.split("||")[0];

        const res = await this.client.get(apiUrl, this.getHeaders());
        let post;
        try { post = JSON.parse(res.body); } catch(e) { return []; }

        const streamUrl = post.videoStreamUrl || "";
        if (!streamUrl) return [];

        return [{
            url: streamUrl,
            originalUrl: streamUrl,
            quality: "HLS",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://fikfap.com/",
                "Origin": "https://fikfap.com"
            }
        }];
    }

    async getPageList(url) { return []; }

    // ── Filters ───────────────────────────────────────────────────────────────

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Hot (Default)", value: "" },
                    { type_name: "SelectOption", name: "New", value: "new" },
                    { type_name: "SelectOption", name: "Top All Time", value: "top" },
                    { type_name: "SelectOption", name: "Top Today", value: "top-day" },
                    { type_name: "SelectOption", name: "Top Week", value: "top-week" },
                    { type_name: "SelectOption", name: "Top Month", value: "top-month" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Sexual Orientation",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Straight", value: "STRAIGHT" },
                    { type_name: "SelectOption", name: "Gay", value: "GAY" },
                    { type_name: "SelectOption", name: "Lesbian", value: "LESBIAN" },
                    { type_name: "SelectOption", name: "Trans", value: "TRANS" },
                    { type_name: "SelectOption", name: "Other", value: "OTHER" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Category / Tag",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All (No Tag)", value: "" },
                    // Top tags sorted by follower count
                    { type_name: "SelectOption", name: "Squirting", value: "squirting" },
                    { type_name: "SelectOption", name: "Shorts", value: "shorts" },
                    { type_name: "SelectOption", name: "Cumshot", value: "cumshot" },
                    { type_name: "SelectOption", name: "Anal", value: "anal" },
                    { type_name: "SelectOption", name: "Legal Teen", value: "legalteen" },
                    { type_name: "SelectOption", name: "Creampie", value: "creampie" },
                    { type_name: "SelectOption", name: "Blowjob", value: "blowjob" },
                    { type_name: "SelectOption", name: "Lesbian", value: "lesbian" },
                    { type_name: "SelectOption", name: "Public", value: "public" },
                    { type_name: "SelectOption", name: "Ass", value: "ass" },
                    { type_name: "SelectOption", name: "Big Boobs", value: "bigboobs" },
                    { type_name: "SelectOption", name: "Hardcore", value: "hardcore" },
                    { type_name: "SelectOption", name: "MILF", value: "milf" },
                    { type_name: "SelectOption", name: "Hot Wife", value: "hotwife" },
                    { type_name: "SelectOption", name: "Girls Who Ride", value: "girlswhoride" },
                    { type_name: "SelectOption", name: "Petite", value: "petite" },
                    { type_name: "SelectOption", name: "Deepthroat", value: "deepthroat" },
                    { type_name: "SelectOption", name: "Doggystyle", value: "doggystyle" },
                    { type_name: "SelectOption", name: "Asian", value: "asianhottie" },
                    { type_name: "SelectOption", name: "Cosplay", value: "cosplay" },
                    { type_name: "SelectOption", name: "College", value: "college" },
                    { type_name: "SelectOption", name: "Hentai", value: "hentai" },
                    { type_name: "SelectOption", name: "Masturbation", value: "masturbation" },
                    { type_name: "SelectOption", name: "Free Use", value: "freeuse" },
                    { type_name: "SelectOption", name: "Goth", value: "goth" },
                    { type_name: "SelectOption", name: "Thick Ass", value: "thickass" },
                    { type_name: "SelectOption", name: "PAWG", value: "pawg" },
                    { type_name: "SelectOption", name: "Asshole", value: "asshole" },
                    { type_name: "SelectOption", name: "Facial", value: "facial" },
                    { type_name: "SelectOption", name: "Asian Gone Wild", value: "asiangonewild" },
                    { type_name: "SelectOption", name: "Threesome", value: "threesome" },
                    { type_name: "SelectOption", name: "Latina", value: "latina" },
                    { type_name: "SelectOption", name: "Titty Drop", value: "tittydrop" },
                    { type_name: "SelectOption", name: "Interracial", value: "interracial" },
                    { type_name: "SelectOption", name: "Orgasm", value: "orgasm" },
                    { type_name: "SelectOption", name: "Group Sex", value: "groupsex" },
                    { type_name: "SelectOption", name: "Face Fuck", value: "facefuck" },
                    { type_name: "SelectOption", name: "Boobs", value: "boobs" },
                    { type_name: "SelectOption", name: "Ahegao", value: "ahegao" },
                    { type_name: "SelectOption", name: "Ebony", value: "ebony" },
                    { type_name: "SelectOption", name: "Twerk", value: "twerk" },
                    { type_name: "SelectOption", name: "Body Perfection", value: "bodyperfection" },
                    { type_name: "SelectOption", name: "Upskirt", value: "upskirt" },
                    { type_name: "SelectOption", name: "Boob Bounce", value: "boobbounce" },
                    { type_name: "SelectOption", name: "BBC", value: "bbc" },
                    { type_name: "SelectOption", name: "Fit Girl", value: "fitgirl" },
                    { type_name: "SelectOption", name: "Chubby", value: "chubby" },
                    { type_name: "SelectOption", name: "Indian", value: "indian" },
                    { type_name: "SelectOption", name: "Pussy Job", value: "pussyjob" },
                    { type_name: "SelectOption", name: "Curvy", value: "curvy" },
                    { type_name: "SelectOption", name: "Couple Sex", value: "couplesex" },
                    { type_name: "SelectOption", name: "Sex Toys", value: "sextoys" },
                    { type_name: "SelectOption", name: "Feet", value: "feet" },
                    { type_name: "SelectOption", name: "Fingering", value: "fingering" },
                    { type_name: "SelectOption", name: "Redhead", value: "redheads" },
                    { type_name: "SelectOption", name: "Femdom", value: "femdom" },
                    { type_name: "SelectOption", name: "Face Sitting", value: "facesitting" },
                    { type_name: "SelectOption", name: "Deep Anal", value: "deepanal" },
                    { type_name: "SelectOption", name: "Tiny Tits", value: "tinytits" },
                    { type_name: "SelectOption", name: "Yoga Pants", value: "yogapants" },
                    { type_name: "SelectOption", name: "BDSM", value: "bdsm" },
                    { type_name: "SelectOption", name: "Cum Swallowing", value: "cumswallowing" },
                    { type_name: "SelectOption", name: "Anal Stretching", value: "analstretching" },
                    { type_name: "SelectOption", name: "Blonde", value: "blonde" },
                    { type_name: "SelectOption", name: "Cuckold", value: "cuckold" },
                    { type_name: "SelectOption", name: "Bubble Butt", value: "bubblebutt" },
                    { type_name: "SelectOption", name: "Cute & Sexy", value: "cutesexy" },
                    { type_name: "SelectOption", name: "Mature", value: "mature" },
                    { type_name: "SelectOption", name: "Bikini", value: "bikini" },
                    { type_name: "SelectOption", name: "Natural", value: "natural" },
                    { type_name: "SelectOption", name: "Stockings", value: "stockings" },
                    { type_name: "SelectOption", name: "Lingerie", value: "lingerie" },
                    { type_name: "SelectOption", name: "Tattoo", value: "tattoo" },
                    { type_name: "SelectOption", name: "Brunette", value: "brunette" },
                    { type_name: "SelectOption", name: "Pegging", value: "pegging" },
                    { type_name: "SelectOption", name: "Fisting", value: "fisting" },
                    { type_name: "SelectOption", name: "Skinny", value: "skinny" },
                    { type_name: "SelectOption", name: "Hairy", value: "hairy" },
                    { type_name: "SelectOption", name: "Japanese", value: "japanese" },
                    { type_name: "SelectOption", name: "Strapon", value: "strapon" },
                    { type_name: "SelectOption", name: "Alternative", value: "alternative" },
                    { type_name: "SelectOption", name: "Ass Spread", value: "assspread" },
                    { type_name: "SelectOption", name: "Panties", value: "panties" },
                    { type_name: "SelectOption", name: "Camwhore", value: "camwhore" },
                    { type_name: "SelectOption", name: "Bisexual", value: "bisexual" },
                    { type_name: "SelectOption", name: "Gamer", value: "gamer" },
                    { type_name: "SelectOption", name: "Lesbian Oral", value: "lesbianoral" },
                    { type_name: "SelectOption", name: "Muscle Girls", value: "musclegirls" },
                    { type_name: "SelectOption", name: "Massage", value: "massage" },
                    { type_name: "SelectOption", name: "Spanking", value: "spanking" },
                    { type_name: "SelectOption", name: "Legs", value: "legs" }
                ]
            }
        ];
    }

    // ── Preferences ───────────────────────────────────────────────────────────

    getSourcePreferences() {
        return [
            {
                key: "overrideBaseUrl",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Change if the site URL has moved (e.g. https://fikfap.com)",
                    value: "https://fikfap.com"
                }
            },
            {
                key: "anonId",
                editTextPreference: {
                    title: "Anonymous Session ID (UUID)",
                    summary: "Auto-generated UUID used for unauthenticated API access. Leave blank to auto-regenerate.",
                    value: ""
                }
            }
        ];
    }
}

var extension = new DefaultExtension();
