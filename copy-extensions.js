const fs = require('fs');
const path = require('path');

const destDir = path.join(__dirname, './extensions/');

// Define the source folders we want to copy from
const sources = [
    path.join(__dirname, '../mangayomi-extensionsTEST/javascript/anime/src/en/working/'),
    path.join(__dirname, '../prod_extension-main/working/'),
    path.join(__dirname, '../yomiextensionreal-main/nsfw/'),
    path.join(__dirname, '../yomiextensionreal-main/real/')
];

// Clean destDir first to ensure no unwanted test extensions are left
if (fs.existsSync(destDir)) {
    fs.readdirSync(destDir).forEach(file => {
        fs.unlinkSync(path.join(destDir, file));
    });
} else {
    fs.mkdirSync(destDir, { recursive: true });
}

let count = 0;
for (const srcDir of sources) {
    if (fs.existsSync(srcDir)) {
        const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
        for (const file of files) {
            fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
            count++;
        }
    } else {
        console.log(`Source extensions directory not found: ${srcDir}. Assuming in production mode.`);
    }
}
console.log(`Copied ${count} production & yomi extensions to local extensions folder`);
