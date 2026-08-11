const path = require('path');
const fs = require('fs');
const { loadExtension } = require('../emulator');

const directories = {
    'development': path.join(__dirname, '../../mangayomi-extensionsTEST/javascript/anime/src/en/working/'),
    'prod-safe': path.join(__dirname, '../../prod_extension-main/working/'),
    'prod-nsfw': path.join(__dirname, '../../yomiextensionreal-main/nsfw/'),
    'prod-real': path.join(__dirname, '../../yomiextensionreal-main/real/')
};

// Simple command line parser
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
        const key = args[i].slice(2);
        const val = args[i + 1];
        options[key] = val;
        i++;
    }
}

const group = options.group || 'development';
const sourceQuery = options.source;
const action = options.action || 'getPopular';

if (!sourceQuery) {
    console.error("Usage: node test-cli.js --source <name_or_id> [--group <group>] [--action <action>] [--param <json_params>] [--preferences <json_preferences>]");
    console.error("\nGroups: development (default), prod-safe, prod-nsfw, prod-real");
    console.error("Actions: getPopular (default), getLatestUpdates, search, getDetail, getVideoList, getFilterList");
    process.exit(1);
}

let params = {};
if (options.param) {
    try {
        params = JSON.parse(options.param);
    } catch (e) {
        console.error("Error: Failed to parse --param JSON:", e.message);
        process.exit(1);
    }
}

let preferences = {};
if (options.preferences) {
    try {
        preferences = JSON.parse(options.preferences);
    } catch (e) {
        console.error("Error: Failed to parse --preferences JSON:", e.message);
        process.exit(1);
    }
}

// Find extension file
const dirPath = directories[group];
if (!dirPath || !fs.existsSync(dirPath)) {
    console.error(`Error: Group directory not found for '${group}': ${dirPath}`);
    process.exit(1);
}

const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
let targetFilePath = null;
let targetMeta = null;

for (const file of files) {
    const fullPath = path.join(dirPath, file);
    try {
        const { metadata } = loadExtension(fullPath);
        const meta = metadata[0];
        if (meta && (
            meta.name.toLowerCase() === sourceQuery.toLowerCase() ||
            String(meta.id) === String(sourceQuery) ||
            file.toLowerCase() === sourceQuery.toLowerCase() ||
            file.toLowerCase() === `${sourceQuery.toLowerCase()}.js`
        )) {
            targetFilePath = fullPath;
            targetMeta = meta;
            break;
        }
    } catch (e) {
        // Skip errors for other files
    }
}

if (!targetFilePath) {
    console.error(`Error: Extension '${sourceQuery}' not found in group '${group}'`);
    console.error("Available files in this group:");
    files.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
}

console.log(`Running action '${action}' on extension '${targetMeta.name}' (${targetFilePath})...`);

const logCallback = (level, message) => {
    const time = new Date().toLocaleTimeString();
    if (level === 'error') {
        console.error(`[${time}] [VM ERROR] ${message}`);
    } else {
        console.log(`[${time}] [VM LOG] ${message}`);
    }
};

try {
    const ext = loadExtension(targetFilePath, preferences, logCallback);
    
    (async () => {
        try {
            let result;
            const startTime = Date.now();
            
            switch (action) {
                case 'getPopular':
                    result = await ext.instance.getPopular(parseInt(params.page || '1', 10));
                    break;
                case 'getLatestUpdates':
                    result = await ext.instance.getLatestUpdates(parseInt(params.page || '1', 10));
                    break;
                case 'search':
                    result = await ext.instance.search(params.query || '', parseInt(params.page || '1', 10), params.filters || []);
                    break;
                case 'getDetail':
                    if (!params.url) throw new Error("Missing required 'url' parameter inside --param JSON");
                    result = await ext.instance.getDetail(params.url);
                    break;
                case 'getVideoList':
                    if (!params.url) throw new Error("Missing required 'url' parameter inside --param JSON");
                    result = await ext.instance.getVideoList(params.url);
                    break;
                case 'getFilterList':
                    result = typeof ext.instance.getFilterList === 'function' ? await ext.instance.getFilterList() : [];
                    break;
                default:
                    throw new Error(`Unsupported action '${action}'`);
            }
            
            const elapsed = Date.now() - startTime;
            console.log(`\n--- EXECUTION SUCCESS (${elapsed}ms) ---`);
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        } catch (e) {
            console.error(`\n--- EXECUTION FAILED ---`);
            console.error(e);
            process.exit(1);
        }
    })();
} catch (e) {
    console.error(`Error: Failed to instantiate extension:`);
    console.error(e);
    process.exit(1);
}
