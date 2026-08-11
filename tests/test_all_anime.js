const { loadExtension } = require('../emulator');
const path = require('path');

const extPath = path.join(__dirname, '../../mangayomi-extensionsTEST/javascript/anime/src/en/working/animotvslash.js');
const ext = loadExtension(extPath, {}, (level, msg) => {
    // console.log(`[${level}] ${msg}`);
});

const episodes = [
    { name: "Wistoria Ep 10", url: "https://animotvslash.org/wistoria-wand-and-sword-season-2-episode-10/" },
    { name: "One Piece Ep 1166", url: "https://animotvslash.org/one-piece-episode-1166/" },
    { name: "Slime Season 4 Ep 10", url: "https://animotvslash.org/that-time-i-got-reincarnated-as-a-slime-season-4-episode-10/" },
    { name: "Classroom of the Elite S4 Ep 14", url: "https://animotvslash.org/classroom-of-the-elite-4th-season-second-year-first-semester-episode-14/" },
    { name: "Jujutsu Kaisen Ep 12", url: "https://animotvslash.org/jujutsu-kaisen-the-culling-game-part-1-episode-12/" }
];

async function run() {
    for (const ep of episodes) {
        console.log(`\n--- Testing getVideoList for: ${ep.name} ---`);
        try {
            const videos = await ext.instance.getVideoList(ep.url);
            console.log(`Success! Extracted ${videos.length} videos.`);
            if (videos.length > 0) {
                videos.forEach((v, i) => {
                    console.log(`  [${i}] Quality: ${v.quality}`);
                    console.log(`      URL: ${v.url.substring(0, 100)}...`);
                });
            } else {
                console.log("  No videos found!");
            }
        } catch (e) {
            console.error(`  Error: ${e.message}`);
        }
    }
}

run();
