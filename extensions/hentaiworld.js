const mangayomiSources = [{
    "name": "HentaiWorld",
    "lang": "en",
    "baseUrl": "https://hentaiworld.tv",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=hentaiworld.tv",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/hentaiworld.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 892317456,
    "notes": "",
    "pkgPath": "nsfw/hentaiworld.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://hentaiworld.tv";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://hentaiworld.tv/"
        };
    }

    getPreferredVideoQuality() {
        try {
            var prefs = new SharedPreferences();
            return prefs.getString("preferred_quality", "MP4");
        } catch (e) {
            return "MP4";
        }
    }

    getListingPage() {
        try {
            var prefs = new SharedPreferences();
            return prefs.getString("listing_page", "most-viewed");
        } catch (e) {
            return "most-viewed";
        }
    }

    async request(url) {
        var res = await this.client.get(url, this.getHeaders());
        return new Document(res.body);
    }

    parseAnimeList(doc) {
        var list = [];

        // Primary: card-container links used on most-viewed, all-episodes pages
        var items = doc.select("a.card-container");
        console.log("card-container items: " + items.length);

        for (var item of items) {
            try {
                var link = item.attr("href") || "";
                if (!link) continue;

                var name = item.attr("title") || "";
                if (!name) {
                    var titleEl = item.selectFirst(".video-title-text");
                    if (titleEl) name = titleEl.text.trim();
                }

                var imageUrl = "";
                var imgEl = item.selectFirst("img");
                if (imgEl) {
                    imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || "";
                }

                if (imageUrl && imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
                if (!link.startsWith("http")) link = this.baseUrl + link;

                if (name && link) {
                    list.push({ name, imageUrl, link });
                }
            } catch (e) {
                console.log("Parse card-container error: " + e);
            }
        }

        // Fallback: standard WordPress article posts (search results)
        if (list.length === 0) {
            var articles = doc.select("article.post, article");
            console.log("article items: " + articles.length);
            for (var article of articles) {
                try {
                    var linkEl = article.selectFirst("a");
                    if (!linkEl) continue;
                    var link = linkEl.attr("href") || "";
                    if (!link) continue;

                    var name = "";
                    var titleEl = article.selectFirst("h2, h3, .entry-title, h1");
                    if (titleEl) name = titleEl.text.trim();
                    if (!name) name = linkEl.attr("title") || "";

                    var imageUrl = "";
                    var imgEl = article.selectFirst("img");
                    if (imgEl) {
                        imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || "";
                    }

                    if (imageUrl && imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
                    if (!link.startsWith("http")) link = this.baseUrl + link;

                    if (name && link) {
                        list.push({ name, imageUrl, link });
                    }
                } catch (e) {
                    console.log("Parse article error: " + e);
                }
            }
        }

        return list;
    }

    hasNextPage(doc) {
        var next = doc.selectFirst("a.next, .next.page-numbers, .nav-links .next");
        return next != null;
    }

    async getPopular(page) {
        var listPage = this.getListingPage();
        var url = this.baseUrl + "/" + listPage + "/" + (page > 1 ? "page/" + page + "/" : "");
        console.log("getPopular: " + url);
        try {
            var doc = await this.request(url);
            var list = this.parseAnimeList(doc);
            var hasNextPage = this.hasNextPage(doc);
            console.log("getPopular results: " + list.length);
            return { list, hasNextPage };
        } catch (e) {
            console.log("getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getLatestUpdates(page) {
        var url = this.baseUrl + "/all-episodes/" + (page > 1 ? "page/" + page + "/" : "");
        console.log("getLatestUpdates: " + url);
        try {
            var doc = await this.request(url);
            var list = this.parseAnimeList(doc);
            var hasNextPage = this.hasNextPage(doc);
            return { list, hasNextPage };
        } catch (e) {
            console.log("getLatestUpdates error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async search(query, page, filters) {
        var url = this.baseUrl + "/?s=" + encodeURIComponent(query) + (page > 1 ? "&paged=" + page : "");
        console.log("search: " + url);
        try {
            var doc = await this.request(url);
            var list = this.parseAnimeList(doc);
            var hasNextPage = this.hasNextPage(doc);
            console.log("search results: " + list.length);
            return { list, hasNextPage };
        } catch (e) {
            console.log("search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getDetail(url) {
        console.log("getDetail: " + url);
        try {
            var doc = await this.request(url);

            var title = "";
            var titleEl = doc.selectFirst("h1.entry-title, h1");
            if (titleEl) title = titleEl.text.trim();

            // Extract series name by stripping "– Episode X" suffix
            var seriesName = title;
            var epMatch = title.match(/^(.+?)\s*[-–]\s*Episode\s*/i);
            if (epMatch) seriesName = epMatch[1].trim();

            var imageUrl = "";
            var imgEl = doc.selectFirst(".left-content img, .episode-info-container img, .post-thumbnail img, .wp-post-image");
            if (imgEl) {
                imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || "";
            }
            if (!imageUrl) {
                var ogImg = doc.selectFirst("meta[property='og:image']");
                if (ogImg) imageUrl = ogImg.attr("content") || "";
            }
            if (imageUrl && imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;

            var description = "";
            var descEls = doc.select("p.episode-description");
            for (var d of descEls) {
                description += d.text.trim() + "\n";
            }
            description = description.trim();

            var genre = [];
            var tagEls = doc.select(".video-tags a, .post-categories a, a[rel='tag']");
            for (var t of tagEls) {
                var gt = t.text.trim();
                if (gt) genre.push(gt);
            }

            // Build episode list from .crp_related (Contextual Related Posts plugin)
            // Filter to only include links whose title starts with the same series name
            var chapters = [];
            var seen = {};

            // Always include the current episode first
            seen[url] = true;
            chapters.push({ name: title || "Episode", url: url });

            // Scrape same-series episodes from the related posts carousel
            var relatedLinks = doc.select(".crp_related a[href*='/hentai-videos/']");
            console.log("crp_related links found: " + relatedLinks.length);

            var seriesLower = seriesName.toLowerCase();
            for (var link of relatedLinks) {
                try {
                    var epUrl = link.attr("href") || "";
                    if (!epUrl || epUrl.includes("#") || seen[epUrl]) continue;

                    var epTitle = link.text.trim();
                    // Filter: only include if the title starts with the series name
                    if (seriesLower && !epTitle.toLowerCase().startsWith(seriesLower)) continue;

                    seen[epUrl] = true;
                    chapters.push({ name: epTitle || epUrl, url: epUrl });
                } catch (le) {
                    console.log("Related link parse error: " + le);
                }
            }

            // Sort episodes numerically by episode number
            chapters.sort(function(a, b) {
                var numA = parseInt(a.name.match(/Episode\s*(\d+)/i)?.[1] || "0") || 0;
                var numB = parseInt(b.name.match(/Episode\s*(\d+)/i)?.[1] || "0") || 0;
                return numA - numB;
            });

            console.log("getDetail: " + seriesName + " — " + chapters.length + " episode(s)");

            return {
                link: url,
                name: seriesName || title,
                imageUrl,
                description,
                genre,
                status: 5,
                chapters
            };
        } catch (e) {
            console.log("getDetail error: " + e);
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
        }
    }

    async getVideoList(url) {
        console.log("getVideoList: " + url);
        try {
            var res = await this.client.get(url, this.getHeaders());
            if (res.statusCode !== 200) {
                console.log("Bad status: " + res.statusCode);
                return [];
            }

            var html = res.body;
            var videos = [];

            // Primary method: extract from window.open download script
            // e.g.: window.open('https://www.porn-d.xyz/.../videos/Title.mp4', '_blank')
            var downloadMatch = html.match(/window\.open\(['"]([^'"]+\.mp4)['"]/);
            if (downloadMatch && downloadMatch[1]) {
                var mp4Url = downloadMatch[1];
                console.log("Found download MP4: " + mp4Url);
                videos.push({
                    url: mp4Url,
                    originalUrl: mp4Url,
                    quality: "MP4",
                    headers: { "Referer": this.baseUrl + "/" }
                });
            }

            // Secondary: scan all mp4 urls in the HTML body
            var mp4Matches = html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g) || [];
            for (var mp4 of mp4Matches) {
                if (!videos.some(function(v) { return v.url === mp4; })) {
                    console.log("Found MP4 in HTML: " + mp4);
                    videos.push({
                        url: mp4,
                        originalUrl: mp4,
                        quality: "MP4 (Direct)",
                        headers: { "Referer": this.baseUrl + "/" }
                    });
                }
            }

            // Tertiary: check iframe src for video player URL then fetch it
            var iframeMatch = html.match(/iframe\.setAttribute\(['"]src['"],\s*['"]([^'"]+)['"]\)/);
            if (!iframeMatch) {
                iframeMatch = html.match(/iframe[^>]+src=['"]([^'"]+video-player[^'"]+)['"]/);
            }

            if (iframeMatch && iframeMatch[1] && videos.length === 0) {
                var playerUrl = iframeMatch[1];
                if (!playerUrl.startsWith("http")) playerUrl = this.baseUrl + playerUrl;
                console.log("Found iframe player URL: " + playerUrl);
                try {
                    var iframeRes = await this.client.get(playerUrl, {
                        "Referer": url,
                        "User-Agent": this.getHeaders()["User-Agent"]
                    });
                    if (iframeRes.statusCode === 200) {
                        var iframeHtml = iframeRes.body;
                        var iframeMp4 = iframeHtml.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g) || [];
                        for (var im of iframeMp4) {
                            if (!videos.some(function(v) { return v.url === im; })) {
                                videos.push({
                                    url: im,
                                    originalUrl: im,
                                    quality: "MP4 (iFrame)",
                                    headers: { "Referer": playerUrl }
                                });
                            }
                        }
                    }
                } catch (ie) {
                    console.log("Iframe fetch error: " + ie);
                }
            }

            console.log("Total videos found: " + videos.length);
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
                key: "listing_page",
                listPreference: {
                    title: "Popular Tab Source",
                    summary: "Which page to use for the Popular tab",
                    valueIndex: 0,
                    entries: ["Most Viewed", "All Episodes"],
                    entryValues: ["most-viewed", "all-episodes"]
                }
            },
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred Video Quality",
                    summary: "Preferred quality label when multiple streams are found",
                    valueIndex: 0,
                    entries: ["MP4 (Best)", "MP4 (Direct)", "MP4 (iFrame)"],
                    entryValues: ["MP4", "MP4 (Direct)", "MP4 (iFrame)"]
                }
            }
        ];
    }
}



