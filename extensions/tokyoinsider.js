const mangayomiSources = [{
    "name": "TokyoInsider",
    "lang": "en",
    "baseUrl": "https://www.tokyoinsider.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=tokyoinsider.com",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": true,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/mangayomi-extensionstet2/main/javascript/anime/src/en/working/tokyoinsider.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 984712039,
    "notes": "TokyoInsider direct download anime scraper",
    "pkgPath": "anime/src/en/working/tokyoinsider.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://www.tokyoinsider.com";
        this.defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }

    getHeaders() {
        var pref = new SharedPreferences();
        var ua = pref.get("custom_user_agent") || "";
        var cf = pref.get("cf_clearance") || "";

        var headers = {
            "Referer": this.baseUrl + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
        };

        if (ua) {
            headers["User-Agent"] = ua;
        }
        if (cf) {
            if (cf.includes("=")) {
                headers["Cookie"] = cf;
            } else {
                headers["Cookie"] = "cf_clearance=" + cf;
            }
        }

        return headers;
    }

    cleanAnimeLink(href) {
        if (!href) return null;
        var path = href;
        if (path.startsWith(this.baseUrl)) {
            path = path.substring(this.baseUrl.length);
        }
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        var parts = path.split("/");
        // Format: /anime/LETTER/SLUG
        if (parts.length >= 4 && parts[1] === "anime" && parts[2].length === 1 && parts[3]) {
            var slug = parts[3];
            var cleanUrl = this.baseUrl + "/anime/" + parts[2] + "/" + slug;
            var cleanName = decodeURIComponent(slug).replace(/_/g, " ");
            return {
                name: cleanName,
                link: cleanUrl
            };
        }
        return null;
    }

    async getPopular(page) {
        // Fetch the home page which lists popular/new uploads
        const res = await this.client.get(this.baseUrl, this.getHeaders());
        if (res.statusCode !== 200) {
            throw new Error("HTTP Error " + res.statusCode + " fetching homepage");
        }

        const doc = new Document(res.body);

        // Debug: Log all forms on the homepage to inspect search parameters
        const forms = doc.select("form");
        for (var i = 0; i < forms.length; i++) {
            console.log("TokyoInsider Homepage Form " + i + ": " + forms[i].outerHtml);
        }

        const links = doc.select("a[href*='/anime/']");
        const list = [];
        const seen = new Set();

        for (var i = 0; i < links.length; i++) {
            const href = links[i].attr("href");
            const parsed = this.cleanAnimeLink(href);
            
            if (parsed) {
                if (!seen.has(parsed.link)) {
                    seen.add(parsed.link);
                    list.push({
                        name: parsed.name,
                        imageUrl: "https://www.google.com/s2/favicons?sz=128&domain=tokyoinsider.com",
                        link: parsed.link
                    });
                }
            }
        }

        return { list: list, hasNextPage: false };
    }

    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }

    async search(query, page, filters) {
        // If user enters a direct URL, return it immediately as the search result
        if (query.startsWith("http://") || query.startsWith("https://")) {
            const cleanTitle = query.split("/").pop().replace(/_/g, " ");
            return {
                list: [{
                    name: cleanTitle,
                    imageUrl: "https://www.google.com/s2/favicons?sz=128&domain=tokyoinsider.com",
                    link: query
                }],
                hasNextPage: false
            };
        }

        // Standard Search - Fallback to /?k=query since index.php?k=query returns 404
        const searchUrl = `${this.baseUrl}/?k=${encodeURIComponent(query)}`;
        const res = await this.client.get(searchUrl, this.getHeaders());
        const doc = new Document(res.body);
        
        const links = doc.select("a[href*='/anime/']");
        const list = [];
        const seen = new Set();

        for (var i = 0; i < links.length; i++) {
            const href = links[i].attr("href");
            const parsed = this.cleanAnimeLink(href);
            
            if (parsed) {
                if (!seen.has(parsed.link)) {
                    seen.add(parsed.link);
                    list.push({
                        name: parsed.name,
                        imageUrl: "https://www.google.com/s2/favicons?sz=128&domain=tokyoinsider.com",
                        link: parsed.link
                    });
                }
            }
        }

        return { list: list, hasNextPage: false };
    }

    async getDetail(url) {
        var cleanUrl = url;
        if (!cleanUrl.startsWith("http")) {
            if (cleanUrl.startsWith("/")) {
                cleanUrl = this.baseUrl + cleanUrl;
            } else {
                cleanUrl = this.baseUrl + "/" + cleanUrl;
            }
        }

        const res = await this.client.get(cleanUrl, this.getHeaders());
        if (res.statusCode !== 200) {
            throw new Error("HTTP " + res.statusCode + " - Failed to load details. Solve Cloudflare challenge in WebView first.");
        }

        const doc = new Document(res.body);

        // Debug: Log all details of the page's HTML structure
        console.log("TokyoInsider Debug: Body length = " + res.body.length);
        
        const hasDownloadLinkClass = res.body.includes("download-link");
        console.log("TokyoInsider Debug: Body contains 'download-link' string? " + hasDownloadLinkClass);

        // Find and print some elements with download-link class
        const dlElements = doc.select(".download-link");
        console.log("TokyoInsider Debug: Elements with .download-link class = " + dlElements.length);
        for (var i = 0; i < Math.min(5, dlElements.length); i++) {
            console.log("DL Element " + i + ": HTML=" + dlElements[i].outerHtml.substring(0, 150));
        }

        // Print some links with /episode/ in their href that are NOT in the sidebar (if any)
        const allEpisodeLinks = doc.select("a[href*='/episode/']");
        console.log("TokyoInsider Debug: Total /episode/ links = " + allEpisodeLinks.length);
        var printedEps = 0;
        for (var i = 0; i < allEpisodeLinks.length; i++) {
            const href = allEpisodeLinks[i].attr("href");
            // If the link is part of the current series page URL slug, it might be an episode link for this series
            if (href && !href.includes("What's Hot") && printedEps < 10) {
                console.log("Ep Link " + i + ": href=" + href + " class=" + allEpisodeLinks[i].attr("class") + " text=" + allEpisodeLinks[i].text.trim());
                printedEps++;
            }
        }

        // Parse Name
        const name = doc.selectFirst("h1, h2.title")?.text.trim() || cleanUrl.split("/").pop().replace(/_/g, " ");
        
        // Parse Description
        const description = doc.selectFirst(".description, #main p")?.text.trim() || "TokyoInsider Direct Anime File";
        
        // Parse Image
        const imageUrl = doc.selectFirst("img[src*='/anime/']")?.attr("src") || "https://www.google.com/s2/favicons?sz=128&domain=tokyoinsider.com";
        
        // Parse Episode List
        // TokyoInsider structures episode list anchors with the "download-link" class
        const episodes = [];
        const episodeElements = doc.select(".download-link");

        for (const el of episodeElements) {
            const anchor = el.selectFirst("a") || el;
            const linkHref = anchor.attr("href");
            const epName = el.text.trim();

            if (linkHref && linkHref.includes("/episode/")) {
                const fullEpUrl = linkHref.startsWith("http") ? linkHref : this.baseUrl + linkHref;
                episodes.push({
                    name: epName,
                    url: fullEpUrl
                });
            }
        }

        // The site list is usually sorted from newest to oldest in the DOM.
        // We reverse it to display chronological order (from Episode 1 upwards)
        episodes.reverse();

        return {
            name: name,
            imageUrl: imageUrl.startsWith("http") ? imageUrl : this.baseUrl + imageUrl,
            description: description,
            genre: ["Anime", "Direct Download"],
            status: 0,
            chapters: episodes
        };
    }

    async getVideoList(url) {
        console.log("TokyoInsider getVideoList fetching: " + url);
        var cleanUrl = url;
        if (!cleanUrl.startsWith("http")) {
            if (cleanUrl.startsWith("/")) {
                cleanUrl = this.baseUrl + cleanUrl;
            } else {
                cleanUrl = this.baseUrl + "/" + cleanUrl;
            }
        }

        const res = await this.client.get(cleanUrl, this.getHeaders());
        if (res.statusCode !== 200) {
            throw new Error("HTTP " + res.statusCode + " - Failed to load video streams. Solve Cloudflare challenge in WebView first.");
        }

        const doc = new Document(res.body);

        const videos = [];
        
        // Identify download option wrapper divs (class c_h2 or c_h2b)
        const optionDivs = doc.select("div.c_h2, div.c_h2b");

        for (var i = 0; i < optionDivs.length; i++) {
            const div = optionDivs[i];
            
            // Extract file metadata (sizes, dates, uploaders are stored inside <b> tags)
            const bTags = div.select("b");
            var sizeLabel = "Direct MP4";
            if (bTags.length > 1) {
                // Typically bTags[1] is file size (e.g. 150 MB or 1.2 GB)
                sizeLabel = bTags[1].text.trim();
            }

            // The download file link is the second <a> tag inside the wrapper div
            const anchors = div.select("a");
            if (anchors.length > 1) {
                const fileUrl = anchors[1].attr("href");
                if (fileUrl && fileUrl.includes("tokyoinsider")) {
                    const fullFileUrl = fileUrl.startsWith("http") ? fileUrl : this.baseUrl + fileUrl;
                    
                    // Add video source with Referer headers to allow direct progressive streaming
                    videos.push({
                        url: fullFileUrl,
                        quality: "Direct Link (" + sizeLabel + ")",
                        headers: {
                            "Referer": this.baseUrl + "/",
                            "User-Agent": this.defaultUserAgent
                        }
                    });
                }
            }
        }

        return videos;
    }

    async getPageList(url) { return []; }
    getFilterList() { return []; }

    getSourcePreferences() {
        return [
            {
                key: "cf_clearance",
                editTextPreference: {
                    title: "Cloudflare Clearance Cookie",
                    summary: "Enter your cf_clearance cookie value if getting 403 errors",
                    value: "",
                    dialogTitle: "cf_clearance cookie",
                    dialogMessage: "Enter the cf_clearance cookie value"
                }
            },
            {
                key: "custom_user_agent",
                editTextPreference: {
                    title: "Custom User Agent",
                    summary: "User agent associated with the cf_clearance cookie",
                    value: "",
                    dialogTitle: "User Agent",
                    dialogMessage: "Enter the browser User Agent string"
                }
            }
        ];
    }
}
