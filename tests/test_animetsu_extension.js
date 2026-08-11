const { loadExtension } = require('../emulator');
const path = require('path');

const extPath = path.join(__dirname, '../../mangayomi-extensionsTEST/javascript/anime/src/en/working/animetsu.js');
const ext = loadExtension(extPath, {}, (level, msg) => {
    console.log(`[${level}] ${msg}`);
});

async function run() {
    try {
        console.log("=== Testing 1. getPopular ===");
        const popular = await ext.instance.getPopular(1);
        console.log(`Popular fetched: ${popular.list.length} items. Has next page: ${popular.hasNextPage}`);
        if (popular.list.length > 0) {
            console.log("First item:", popular.list[0]);
        }

        console.log("\n=== Testing 2. getLatestUpdates ===");
        const latest = await ext.instance.getLatestUpdates(1);
        console.log(`Latest updates fetched: ${latest.list.length} items. Has next page: ${latest.hasNextPage}`);
        if (latest.list.length > 0) {
            console.log("First item:", latest.list[0]);
        }

        console.log("\n=== Testing 3. search (Solo Leveling) ===");
        const searchRes = await ext.instance.search("Solo Leveling", 1, []);
        console.log(`Search fetched: ${searchRes.list.length} items. Has next page: ${searchRes.hasNextPage}`);
        if (searchRes.list.length > 0) {
            console.log("First search result:", searchRes.list[0]);
        }

        console.log("\n=== Testing 4. getDetail (Solo Leveling) ===");
        // Use Solo Leveling's ID from the search response or the test
        const animeUrl = "https://animetsu.net/anime/6989b8a129cf95f4eb03b50c";
        const detail = await ext.instance.getDetail(animeUrl);
        console.log("Name:", detail.name);
        console.log("Image URL:", detail.imageUrl);
        console.log("Status:", detail.status);
        console.log("Genres:", detail.genre);
        console.log("Episodes Count:", detail.chapters.length);
        if (detail.chapters.length > 0) {
            console.log("First episode:", detail.chapters[0]);
            console.log("Last episode:", detail.chapters[detail.chapters.length - 1]);
        }

        console.log("\n=== Testing 5. getVideoList (Solo Leveling Ep 1) ===");
        const epUrl = "https://animetsu.net/watch/6989b8a129cf95f4eb03b50c?ep=1";
        const videos = await ext.instance.getVideoList(epUrl);
        console.log(`Fetched ${videos.length} videos.`);
        videos.forEach((v, i) => {
            console.log(`  [${i}] Quality: ${v.quality}`);
            console.log(`      URL: ${v.url}`);
            console.log(`      Subtitles: ${v.subtitles ? v.subtitles.length : 0}`);
            if (v.subtitles && v.subtitles.length > 0) {
                console.log(`      First Sub: ${v.subtitles[0].label} -> ${v.subtitles[0].file}`);
            }
        });

    } catch (e) {
        console.error("Test error:", e);
    }
}

run();
