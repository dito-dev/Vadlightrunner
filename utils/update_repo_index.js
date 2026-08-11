const fs = require('fs');
const path = require('path');

function updateSingleRepoIndex(repoDir, rawBaseUrl) {
    const workingDir = path.join(repoDir, 'working');
    if (!fs.existsSync(workingDir)) return;

    const files = fs.readdirSync(workingDir).filter(f => f.endsWith('.js'));
    const animeSources = [];
    const mangaSources = [];
    const allSources = [];

    for (const file of files) {
        const filePath = path.join(workingDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        const match = content.match(/const\s+mangayomiSources\s*=\s*(\[[\s\S]*?\]);/);
        if (!match) continue;

        try {
            const sources = JSON.parse(match[1]);
            for (const src of sources) {
                src.pkgPath = `working/${file}`;
                src.sourceCodeUrl = `${rawBaseUrl}working/${file}`;
                
                allSources.push(src);
                if (src.isManga || src.itemType === 0) {
                    mangaSources.push(src);
                } else {
                    animeSources.push(src);
                }
            }
        } catch (e) {
            console.error(`Error parsing mangayomiSources in ${file}:`, e.message);
        }
    }

    fs.writeFileSync(path.join(repoDir, 'anime_index.json'), JSON.stringify(animeSources, null, 2), 'utf8');
    fs.writeFileSync(path.join(repoDir, 'index.json'), JSON.stringify(mangaSources.length > 0 ? mangaSources : allSources, null, 2), 'utf8');

    console.log(`Updated repo index for ${repoDir}: ${animeSources.length} anime extensions in anime_index.json`);
}

function main() {
    // Run for prod_extension-main
    updateSingleRepoIndex(
        path.join(__dirname, '../../prod_extension-main'),
        'https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/'
    );

    // Also run for mangayomi-extensionsTEST
    const testRepoDir = path.join(__dirname, '../../mangayomi-extensionsTEST');
    const testWorkingDir = path.join(testRepoDir, 'javascript/anime/src/en/working');
    if (fs.existsSync(testWorkingDir)) {
        const files = fs.readdirSync(testWorkingDir).filter(f => f.endsWith('.js'));
        const animeSources = [];
        const allSources = [];
        for (const file of files) {
            const filePath = path.join(testWorkingDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const match = content.match(/const\s+mangayomiSources\s*=\s*(\[[\s\S]*?\]);/);
            if (match) {
                try {
                    const sources = JSON.parse(match[1]);
                    for (const src of sources) {
                        src.pkgPath = `javascript/anime/src/en/working/${file}`;
                        src.sourceCodeUrl = `https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/mangayomi-extensionstet2/main/javascript/anime/src/en/working/${file}`;
                        allSources.push(src);
                        animeSources.push(src);
                    }
                } catch (e) {}
            }
        }
        fs.writeFileSync(path.join(testRepoDir, 'anime_index.json'), JSON.stringify(animeSources, null, 2), 'utf8');
        fs.writeFileSync(path.join(testRepoDir, 'index.json'), JSON.stringify(allSources, null, 2), 'utf8');
        console.log(`Updated test repo index for ${testRepoDir}: ${animeSources.length} extensions`);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    updateSingleRepoIndex
};
