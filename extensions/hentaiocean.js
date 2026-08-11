const mangayomiSources = [{
    "name": "HentaiOcean",
    "lang": "en",
    "baseUrl": "https://hentaiocean.com",
    "apiUrl": "",
    "iconUrl": "https://hentaiocean.com/favicon.png",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/hentaiocean.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 877853517,
    "notes": "HentaiOcean English Subbed adult anime extension.",
    "pkgPath": "nsfw/hentaiocean.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://hentaiocean.com";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Referer": "https://hentaiocean.com/"
        };
    }

    getStreamHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
            "Referer": "https://hentaiocean.com/"
        };
    }

    parseListingPage(html) {
        var doc = new Document(html);
        var list = [];
        var items = doc.select("a.cell.card, div.compact-video-card a");
        for (var el of items) {
            var itemLink = el.attr("href") || "";
            if (!itemLink) continue;
            if (!itemLink.startsWith("http")) {
                itemLink = this.baseUrl + itemLink;
            }

            var imgEl = el.selectFirst("img");
            var titleEl = el.selectFirst(".subtitle, .compact-title, h2, p");

            var name = titleEl ? titleEl.text.trim() : "";
            if (!name && imgEl) {
                name = imgEl.attr("alt") || "";
            }

            var imageUrl = imgEl ? (imgEl.attr("src") || imgEl.attr("data-src") || "") : "";
            if (imageUrl && !imageUrl.startsWith("http")) {
                imageUrl = this.baseUrl + imageUrl;
            }

            if (name && itemLink) {
                list.push({
                    name: name,
                    imageUrl: imageUrl,
                    link: itemLink
                });
            }
        }
        return list;
    }

    async getPopular(page) {
        var url = this.baseUrl + "/explore";
        if (page > 1) {
            url = this.baseUrl + "/view/recent-releases";
        }
        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);
        return { list: list, hasNextPage: page === 1 };
    }

    async getLatestUpdates(page) {
        var url = this.baseUrl + "/view/recent-releases";
        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);
        return { list: list, hasNextPage: false };
    }

    async search(query, page, filters) {
        var url = this.baseUrl + "/explore";

        if (filters && filters.length > 0) {
            for (var filter of filters) {
                if (filter.type_name === "SelectFilter" && filter.name === "Genre") {
                    var selectedGenre = filter.values[filter.state].value;
                    if (selectedGenre) {
                        url = this.baseUrl + "/genre/" + encodeURIComponent(selectedGenre);
                    }
                }
            }
        }

        var res = await this.client.get(url, this.getHeaders());
        var list = this.parseListingPage(res.body);

        if (query && query.trim().length > 0) {
            var q = query.trim().toLowerCase();
            list = list.filter(function(item) {
                return item.name.toLowerCase().includes(q);
            });
        }

        return { list: list, hasNextPage: false };
    }

    async getDetail(url) {
        var res = await this.client.get(url, this.getHeaders());
        var html = res.body;
        var doc = new Document(html);

        var name = "";
        var imageUrl = "";
        var description = "";
        var genres = [];

        // Attempt JSON extraction from script tag
        var scriptEls = doc.select("script");
        for (var script of scriptEls) {
            var stext = script.text || "";
            if (stext.includes("var jsondata = ")) {
                try {
                    var jsonStr = stext.split("var jsondata = ")[1].split("</script>")[0].split(";")[0].trim();
                    var jsondata = JSON.parse(jsonStr);
                    if (jsondata && jsondata.info && jsondata.info.length > 0) {
                        var info = jsondata.info[0];
                        name = info.videoname || info.urlname || "";
                        description = info.description || "";
                        if (info.coverimg) {
                            imageUrl = this.baseUrl + "/assets/cover/" + info.coverimg;
                        }
                    }
                    if (jsondata && jsondata.genres) {
                        for (var g of jsondata.genres) {
                            if (g.genre) genres.push(g.genre);
                        }
                    }
                } catch (e) {
                    console.log("Error parsing jsondata: " + e);
                }
                break;
            }
        }

        // Fallback DOM selectors
        if (!name) {
            var titleEl = doc.selectFirst("h1.title, h1");
            name = titleEl ? titleEl.text.trim() : "";
        }
        if (!imageUrl) {
            var imgEl = doc.selectFirst("img.cover-ratio-img, .column img");
            imageUrl = imgEl ? (imgEl.attr("src") || imgEl.attr("data-src") || "") : "";
            if (imageUrl && !imageUrl.startsWith("http")) {
                imageUrl = this.baseUrl + imageUrl;
            }
        }
        if (!description) {
            var descEl = doc.selectFirst(".column.is-9 p:last-of-type, .column.is-9");
            description = descEl ? descEl.text.trim() : "";
        }
        if (genres.length === 0) {
            var tagEls = doc.select(".tags-container a.tag");
            for (var tag of tagEls) {
                genres.push(tag.text.trim());
            }
        }

        // Episodes / Chapters extraction
        var epEls = doc.select(".compact-video-card a");
        var chapters = [];
        for (var ep of epEls) {
            var epLink = ep.attr("href") || "";
            if (epLink && !epLink.startsWith("http")) {
                epLink = this.baseUrl + epLink;
            }
            var epTitle = ep.selectFirst(".compact-title") ? ep.selectFirst(".compact-title").text.trim() : "";
            if (!epTitle && ep.selectFirst("img")) {
                epTitle = ep.selectFirst("img").attr("alt") || "";
            }
            if (epLink) {
                chapters.push({
                    name: epTitle || "Episode",
                    url: epLink
                });
            }
        }

        if (chapters.length === 0) {
            chapters.push({
                name: name || "Episode 1",
                url: url
            });
        }

        return {
            name: name,
            imageUrl: imageUrl,
            description: description,
            genre: genres,
            status: 1,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        var res = await this.client.get(url, this.getHeaders());
        var html = res.body;
        var doc = new Document(html);

        var videos = [];
        var streamHeaders = this.getStreamHeaders();

        // Strategy 1: Extract from jsondata script
        var scriptEls = doc.select("script");
        for (var script of scriptEls) {
            var stext = script.text || "";
            if (stext.includes("var jsondata = ")) {
                try {
                    var jsonStr = stext.split("var jsondata = ")[1].split("</script>")[0].split(";")[0].trim();
                    var jsondata = JSON.parse(jsonStr);
                    if (jsondata && jsondata.mirrors && jsondata.mirrors.length > 0) {
                        for (var i = 0; i < jsondata.mirrors.length; i++) {
                            var mir = jsondata.mirrors[i];
                            var murl = mir.mirrorurl || "";
                            if (murl.includes("vid=")) {
                                var rawVid = murl.split("vid=")[1].split("&")[0];
                                var cleanVid = decodeURIComponent(rawVid);
                                var directUrl = "https://w2.hentaiocean.com/video/" + encodeURIComponent(cleanVid);
                                var label = "HentaiOcean Mirror " + (i + 1);
                                if (murl.includes("/play?")) label = "VIP Mirror " + (i + 1);
                                else if (murl.includes("/universal?")) label = "Universal Mirror";

                                videos.push({
                                    url: directUrl,
                                    originalUrl: murl,
                                    quality: label,
                                    headers: streamHeaders
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.log("Error parsing jsondata mirrors: " + e);
                }
                break;
            }
        }

        // Strategy 2: If jsondata mirrors failed, check iframe embed sources
        if (videos.length === 0) {
            var iframes = doc.select("iframe[src]");
            for (var iframe of iframes) {
                var isrc = iframe.attr("src") || "";
                if (isrc.includes("vid=")) {
                    var rawVid = isrc.split("vid=")[1].split("&")[0];
                    var cleanVid = decodeURIComponent(rawVid);
                    var directUrl = "https://w2.hentaiocean.com/video/" + encodeURIComponent(cleanVid);
                    videos.push({
                        url: directUrl,
                        originalUrl: isrc,
                        quality: "Embed Stream",
                        headers: streamHeaders
                    });
                }
            }
        }

        return videos;
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Genre",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "3D", value: "3D" },
                    { type_name: "SelectOption", name: "Ahegao", value: "Ahegao" },
                    { type_name: "SelectOption", name: "Anal", value: "Anal" },
                    { type_name: "SelectOption", name: "Animal Ears", value: "Animal Ears" },
                    { type_name: "SelectOption", name: "Big Boobs", value: "Big Boobs" },
                    { type_name: "SelectOption", name: "Blowjob", value: "Blowjob" },
                    { type_name: "SelectOption", name: "Boobjob", value: "Boobjob" },
                    { type_name: "SelectOption", name: "Comedy", value: "Comedy" },
                    { type_name: "SelectOption", name: "Cosplay", value: "Cosplay" },
                    { type_name: "SelectOption", name: "Creampie", value: "Creampie" },
                    { type_name: "SelectOption", name: "Dark Skin", value: "Dark Skin" },
                    { type_name: "SelectOption", name: "Facial", value: "Facial" },
                    { type_name: "SelectOption", name: "Fantasy", value: "Fantasy" },
                    { type_name: "SelectOption", name: "Footjob", value: "Footjob" },
                    { type_name: "SelectOption", name: "Futanari", value: "Futanari" },
                    { type_name: "SelectOption", name: "Gangbang", value: "Gangbang" },
                    { type_name: "SelectOption", name: "Gyaru", value: "Gyaru" },
                    { type_name: "SelectOption", name: "Handjob", value: "Handjob" },
                    { type_name: "SelectOption", name: "Harem", value: "Harem" },
                    { type_name: "SelectOption", name: "Incest", value: "Incest" },
                    { type_name: "SelectOption", name: "Lactation", value: "Lactation" },
                    { type_name: "SelectOption", name: "Maid", value: "Maid" },
                    { type_name: "SelectOption", name: "Masturbation", value: "Masturbation" },
                    { type_name: "SelectOption", name: "Milf", value: "Milf" },
                    { type_name: "SelectOption", name: "Mind Break", value: "Mind Break" },
                    { type_name: "SelectOption", name: "NTR", value: "NTR" },
                    { type_name: "SelectOption", name: "Nurse", value: "Nurse" },
                    { type_name: "SelectOption", name: "Orgy", value: "Orgy" },
                    { type_name: "SelectOption", name: "POV", value: "POV" },
                    { type_name: "SelectOption", name: "Pregnant", value: "Pregnant" },
                    { type_name: "SelectOption", name: "Public Sex", value: "Public Sex" },
                    { type_name: "SelectOption", name: "Rape", value: "Rape" },
                    { type_name: "SelectOption", name: "Rimjob", value: "Rimjob" },
                    { type_name: "SelectOption", name: "Scat", value: "Scat" },
                    { type_name: "SelectOption", name: "School Girl", value: "School Girl" },
                    { type_name: "SelectOption", name: "Softcore", value: "Softcore" },
                    { type_name: "SelectOption", name: "Shoutacon", value: "Shoutacon" },
                    { type_name: "SelectOption", name: "Swimsuit", value: "Swimsuit" },
                    { type_name: "SelectOption", name: "Teacher", value: "Teacher" },
                    { type_name: "SelectOption", name: "Tentacles", value: "Tentacles" },
                    { type_name: "SelectOption", name: "Toys", value: "Toys" },
                    { type_name: "SelectOption", name: "Tsundere", value: "Tsundere" },
                    { type_name: "SelectOption", name: "Ugly Bastard", value: "Ugly Bastard" },
                    { type_name: "SelectOption", name: "Uncensored", value: "Uncensored" },
                    { type_name: "SelectOption", name: "Vanilla", value: "Vanilla" },
                    { type_name: "SelectOption", name: "Virgin", value: "Virgin" },
                    { type_name: "SelectOption", name: "X-Ray", value: "X-Ray" },
                    { type_name: "SelectOption", name: "Yaoi", value: "Yaoi" },
                    { type_name: "SelectOption", name: "Yuri", value: "Yuri" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
