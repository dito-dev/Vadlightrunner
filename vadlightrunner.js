#!/usr/bin/env node
/**
 * VadLightrunner CLI
 * 
 * A comprehensive CLI tool for testing and managing Mangayomi extensions.
 * 
 * Usage:
 *   node vadlightrunner.js test <extension> --action <action> [--param <json>]
 *   node vadlightrunner.js list [--group <group>]
 *   node vadlightrunner.js health [--group <group>]
 *   node vadlightrunner.js scaffold --name <Name> --url <baseUrl> [--type anime|manga]
 *   node vadlightrunner.js info <extension> [--group <group>]
 */

const path = require('path');
const fs = require('fs');
const { loadExtension, scriptCache } = require('./emulator');
const { generateSkeleton, listTemplates } = require('./utils/skeleton_generator');
const { globalResponseCache } = require('./utils/response_cache');
const { validateExtension, validateDirectory } = require('./utils/extension_validator');
const { deployExtension } = require('./utils/deploy_helper');

// --- Configuration ---
const directories = {
    'development': path.join(__dirname, '../mangayomi-extensionsTEST/javascript/anime/src/en/working/'),
    'prod-safe': path.join(__dirname, '../prod_extension-main/working/'),
    'prod-nsfw': path.join(__dirname, '../yomiextensionreal-main/nsfw/'),
    'prod-real': path.join(__dirname, '../yomiextensionreal-main/real/')
};

const EXEC_TIMEOUT_MS = 30000;

// --- Styling Helpers ---
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m'
};

function c(color, text) {
    return colors[color] + text + colors.reset;
}

function printBanner() {
    console.log(c('cyan', ''));
    console.log(c('cyan', '  ╔═══════════════════════════════════════╗'));
    console.log(c('cyan', '  ║') + c('bold', '     ⚡ VadLightrunner CLI v2.0 ') + c('cyan', '       ║'));
    console.log(c('cyan', '  ║') + c('dim', '    Mangayomi Extension Test Suite ') + c('cyan', '   ║'));
    console.log(c('cyan', '  ╚═══════════════════════════════════════╝'));
    console.log('');
}

function printUsage() {
    printBanner();
    console.log(c('bold', '  COMMANDS:\n'));
    console.log('    ' + c('green', 'test') + '      <source>      Run an extension action');
    console.log('    ' + c('green', 'list') + '                     List all available extensions');
    console.log('    ' + c('green', 'health') + '                   Run health checks on all extensions');
    console.log('    ' + c('green', 'scaffold') + '                 Generate a new extension from a smart template');
    console.log('    ' + c('green', 'templates') + '                List all available extension templates');
    console.log('    ' + c('green', 'validate') + '   [source]       Validate extension structure & spec contract');
    console.log('    ' + c('green', 'deploy') + '     <source>       Deploy extension from dev to prod repo');
    console.log('    ' + c('green', 'info') + '      <source>      Show extension metadata');
    console.log('    ' + c('green', 'cache') + '     <stats|clear> Manage HTTP response cache');
    console.log('    ' + c('green', 'metrics') + '                  Display process memory and runtime metrics');
    console.log('');
    console.log(c('bold', '  OPTIONS:\n'));
    console.log('    --group <group>          Extension group: development, prod-safe, prod-nsfw, prod-real');
    console.log('    --action <action>        Action: getPopular, getLatestUpdates, search, getDetail, getVideoList');
    console.log('    --param <json>           JSON parameters (e.g., {"page":1,"query":"test"})');
    console.log('    --preferences <json>     JSON preferences for SharedPreferences');
    console.log('    --name <Name>            Extension name for scaffold');
    console.log('    --url <baseUrl>          Base URL for scaffold');
    console.log('    --template <template>    Template: api-json (default), html-scraper, hybrid, manga-reader');
    console.log('    --type <anime|manga>     Legacy alias for --template (maps to api-json / manga-reader)');
    console.log('    --apiurl <apiUrl>        API URL for api-json/hybrid templates (default: baseUrl/api)');
    console.log('    --target <target>        Deploy target: prod-safe, prod-nsfw, prod-real');
    console.log('    --dry-run                Simulate deployment without modifying files');
    console.log('    --force                  Force deployment despite warnings');
    console.log('    --output <dir>           Output directory for scaffold');
    console.log('');
    console.log(c('bold', '  EXAMPLES:\n'));
    console.log(c('dim', '    node vadlightrunner.js test animetsu --action getPopular'));
    console.log(c('dim', '    node vadlightrunner.js test animetsu --action search --param \'{"query":"naruto"}\''));
    console.log(c('dim', '    node vadlightrunner.js scaffold --name MyAnime --url https://example.com --template api-json'));
    console.log(c('dim', '    node vadlightrunner.js validate animetsu'));
    console.log(c('dim', '    node vadlightrunner.js deploy animetsu --target prod-safe --dry-run'));
    console.log(c('dim', '    node vadlightrunner.js list --group development'));
    console.log(c('dim', '    node vadlightrunner.js health'));
    console.log(c('dim', '    node vadlightrunner.js cache stats'));
    console.log('');
}

// --- Argument Parser ---
function parseArgs() {
    const args = process.argv.slice(2);
    const command = args[0];
    const positional = [];
    const options = {};

    for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            const val = args[i + 1];
            options[key] = val;
            i++;
        } else {
            positional.push(args[i]);
        }
    }

    return { command, positional, options };
}

// --- Extension Finder ---
function findExtension(sourceQuery, group = 'development') {
    const dirPath = directories[group];
    if (!dirPath || !fs.existsSync(dirPath)) {
        return { error: `Group directory not found for '${group}': ${dirPath}` };
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        try {
            const { metadata } = loadExtension(fullPath);
            const meta = metadata[0];
            if (meta && (
                meta.name.toLowerCase() === sourceQuery.toLowerCase() ||
                String(meta.id) === String(sourceQuery) ||
                file.toLowerCase() === sourceQuery.toLowerCase() ||
                file.toLowerCase() === sourceQuery.toLowerCase() + '.js'
            )) {
                return { filePath: fullPath, meta, fileName: file };
            }
        } catch (e) {
            // Skip errors
        }
    }
    return { error: `Extension '${sourceQuery}' not found in group '${group}'` };
}

// --- Scan all extensions ---
function scanAllExtensions(group = null) {
    const results = [];
    const groups = group ? { [group]: directories[group] } : directories;

    for (const [grp, dirPath] of Object.entries(groups)) {
        if (!dirPath || !fs.existsSync(dirPath)) continue;
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            try {
                const { metadata } = loadExtension(fullPath);
                const meta = metadata[0];
                if (meta) {
                    results.push({
                        group: grp,
                        fileName: file,
                        filePath: fullPath,
                        name: meta.name,
                        id: meta.id,
                        version: meta.version,
                        baseUrl: meta.baseUrl,
                        lang: meta.lang,
                        isNsfw: meta.isNsfw
                    });
                }
            } catch (e) {
                results.push({
                    group: grp,
                    fileName: file,
                    filePath: fullPath,
                    error: e.message
                });
            }
        }
    }
    return results;
}

// --- Commands ---

async function cmdTest(sourceQuery, options) {
    const group = options.group || 'development';
    const action = options.action || 'getPopular';

    let params = {};
    if (options.param) {
        try { params = JSON.parse(options.param); } catch (e) {
            console.error(c('red', '✗ Failed to parse --param JSON:'), e.message);
            process.exit(1);
        }
    }

    let preferences = {};
    if (options.preferences) {
        try { preferences = JSON.parse(options.preferences); } catch (e) {
            console.error(c('red', '✗ Failed to parse --preferences JSON:'), e.message);
            process.exit(1);
        }
    }

    const found = findExtension(sourceQuery, group);
    if (found.error) {
        console.error(c('red', '✗ ' + found.error));
        process.exit(1);
    }

    console.log(c('cyan', '⚡ Testing: ') + c('bold', found.meta.name) + c('dim', ` (${found.fileName})`));
    console.log(c('cyan', '   Action:  ') + c('yellow', action));
    if (Object.keys(params).length > 0) {
        console.log(c('cyan', '   Params:  ') + JSON.stringify(params));
    }
    console.log('');

    const logs = [];
    const logCallback = (level, message) => {
        const time = new Date().toLocaleTimeString();
        const levelColor = level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'dim';
        console.log(c('dim', `  [${time}]`) + c(levelColor, ` [${level.toUpperCase()}] `) + message);
        logs.push({ level, message, time });
    };

    try {
        const ext = loadExtension(found.filePath, preferences, logCallback);
        const startTime = Date.now();
        let result;

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timed out after ${EXEC_TIMEOUT_MS}ms`)), EXEC_TIMEOUT_MS)
        );

        switch (action) {
            case 'getPopular':
                result = await Promise.race([ext.instance.getPopular(parseInt(params.page || '1', 10)), timeoutPromise]);
                break;
            case 'getLatestUpdates':
                result = await Promise.race([ext.instance.getLatestUpdates(parseInt(params.page || '1', 10)), timeoutPromise]);
                break;
            case 'search':
                result = await Promise.race([ext.instance.search(params.query || '', parseInt(params.page || '1', 10), params.filters || []), timeoutPromise]);
                break;
            case 'getDetail':
                if (!params.url) throw new Error("Missing 'url' in --param for getDetail");
                result = await Promise.race([ext.instance.getDetail(params.url), timeoutPromise]);
                break;
            case 'getVideoList':
                if (!params.url) throw new Error("Missing 'url' in --param for getVideoList");
                result = await Promise.race([ext.instance.getVideoList(params.url), timeoutPromise]);
                break;
            case 'getFilterList':
                result = typeof ext.instance.getFilterList === 'function'
                    ? await Promise.race([ext.instance.getFilterList(), timeoutPromise])
                    : [];
                break;
            default:
                throw new Error(`Unknown action '${action}'`);
        }

        const elapsed = Date.now() - startTime;
        console.log('');
        console.log(c('green', '  ✓ SUCCESS') + c('dim', ` (${elapsed}ms)`));
        console.log(c('dim', '  ─────────────────────────'));
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.log('');
        console.log(c('red', '  ✗ FAILED: ') + e.message);
        process.exit(1);
    }
}

function cmdList(options) {
    const group = options.group || null;
    const extensions = scanAllExtensions(group);

    console.log(c('bold', '  Available Extensions:\n'));

    const grouped = {};
    for (const ext of extensions) {
        if (!grouped[ext.group]) grouped[ext.group] = [];
        grouped[ext.group].push(ext);
    }

    for (const [grp, exts] of Object.entries(grouped)) {
        console.log(c('cyan', `  ┌─ ${grp} `) + c('dim', `(${exts.length} extensions)`));
        for (const ext of exts) {
            if (ext.error) {
                console.log(c('red', `  │  ✗ ${ext.fileName}`) + c('dim', ` — ${ext.error}`));
            } else {
                const nsfw = ext.isNsfw ? c('red', ' [NSFW]') : '';
                console.log(`  │  ${c('green', '●')} ${c('bold', ext.name)} ${c('dim', `v${ext.version}`)}${nsfw}`);
                console.log(`  │    ${c('dim', ext.baseUrl)}`);
            }
        }
        console.log(c('cyan', '  └─'));
        console.log('');
    }

    const total = extensions.filter(e => !e.error).length;
    const failed = extensions.filter(e => e.error).length;
    console.log(c('bold', `  Total: ${total} loaded`) + (failed > 0 ? c('red', `, ${failed} failed`) : ''));
}

async function cmdHealth(options) {
    const group = options.group || null;
    const extensions = scanAllExtensions(group);

    console.log(c('bold', '  Extension Health Check:\n'));

    let healthy = 0;
    let broken = 0;

    for (const ext of extensions) {
        if (ext.error) {
            console.log(c('red', `  ✗ ${ext.fileName}`) + c('dim', ` [${ext.group}]`) + c('red', ` — Load Error: ${ext.error}`));
            broken++;
            continue;
        }

        // Try calling getPopular(1) as a basic health check
        try {
            const loaded = loadExtension(ext.filePath);
            const startTime = Date.now();

            const result = await Promise.race([
                loaded.instance.getPopular(1),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout (10s)')), 10000))
            ]);

            const elapsed = Date.now() - startTime;
            const count = result?.list?.length || 0;

            if (count > 0) {
                console.log(c('green', `  ✓ ${ext.name}`) + c('dim', ` [${ext.group}]`) + c('dim', ` — ${count} items in ${elapsed}ms`));
                healthy++;
            } else {
                console.log(c('yellow', `  ⚠ ${ext.name}`) + c('dim', ` [${ext.group}]`) + c('yellow', ` — 0 items returned (${elapsed}ms)`));
                healthy++; // Still loaded, just empty
            }
        } catch (e) {
            console.log(c('red', `  ✗ ${ext.name}`) + c('dim', ` [${ext.group}]`) + c('red', ` — ${e.message}`));
            broken++;
        }
    }

    console.log('');
    console.log(c('bold', '  ─────────────────────────'));
    console.log(c('green', `  Healthy: ${healthy}`) + '  ' + c('red', `Broken: ${broken}`) + '  ' + c('dim', `Total: ${extensions.length}`));
}

function cmdScaffold(options) {
    const name = options.name;
    const baseUrl = options.url;
    const outputDir = options.output || directories['development'] || '.';

    // Resolve template: --template takes priority, --type is legacy fallback
    let template = options.template;
    if (!template && options.type) {
        template = options.type === 'manga' ? 'manga-reader' : 'api-json';
    }
    if (!template) template = 'api-json';

    const apiUrl = options.apiurl || '';

    if (!name || !baseUrl) {
        console.error(c('red', '✗ Missing required --name and --url flags'));
        console.log(c('dim', '  Example: node lightrunner.js scaffold --name MyAnime --url https://example.com --template api-json'));
        console.log(c('dim', '  Run "node lightrunner.js templates" to see all available templates'));
        process.exit(1);
    }

    console.log(c('cyan', '  ⚡ Generating extension from smart template...'));
    console.log(c('dim', `    Name:      ${name}`));
    console.log(c('dim', `    URL:       ${baseUrl}`));
    console.log(c('dim', `    Template:  ${template}`));
    if (apiUrl) console.log(c('dim', `    API URL:   ${apiUrl}`));
    console.log(c('dim', `    Output:    ${outputDir}`));
    console.log('');

    try {
        const result = generateSkeleton({
            name,
            baseUrl,
            apiUrl,
            template,
            outputDir
        });

        console.log(c('green', '  ✓ Generated: ') + c('bold', result.filePath));
        console.log(c('dim', `    ID: ${result.id}, Type: ${result.type}, Template: ${result.template}`));
        console.log('');
        console.log(c('cyan', '  Next steps:'));
        console.log(c('dim', '    1. Open the generated file and update the TODO CSS selectors / API endpoints'));
        console.log(c('dim', '    2. Test with: node lightrunner.js test ' + name.toLowerCase() + ' --action getPopular'));
        console.log(c('dim', '    3. Validate: node lightrunner.js validate ' + name.toLowerCase()));
    } catch (e) {
        console.error(c('red', '  ✗ Failed: ') + e.message);
        process.exit(1);
    }
}

function cmdTemplates() {
    const templates = listTemplates().filter(t => !t.hidden);

    console.log(c('bold', '  Available Extension Templates:\n'));

    for (const tmpl of templates) {
        console.log(`  ${c('green', '●')} ${c('bold', tmpl.type)} ${c('dim', `[${tmpl.category}]`)}`);
        console.log(`    ${tmpl.description}`);
        console.log(`    ${c('dim', tmpl.details)}`);
        if (tmpl.example) {
            console.log(`    ${c('cyan', 'Examples:')} ${c('dim', tmpl.example)}`);
        }
        console.log('');
    }

    console.log(c('bold', '  Usage:'));
    console.log(c('dim', '    node lightrunner.js scaffold --name MySource --url https://example.com --template api-json'));
    console.log('');
}

function cmdInfo(sourceQuery, options) {
    const group = options.group || 'development';
    const found = findExtension(sourceQuery, group);

    if (found.error) {
        console.error(c('red', '✗ ' + found.error));
        process.exit(1);
    }

    const meta = found.meta;
    console.log(c('bold', '\n  Extension Info:\n'));
    console.log(`  ${c('cyan', 'Name:')}         ${c('bold', meta.name)}`);
    console.log(`  ${c('cyan', 'ID:')}           ${meta.id}`);
    console.log(`  ${c('cyan', 'Version:')}      ${meta.version}`);
    console.log(`  ${c('cyan', 'Language:')}     ${meta.lang}`);
    console.log(`  ${c('cyan', 'Base URL:')}     ${meta.baseUrl}`);
    console.log(`  ${c('cyan', 'NSFW:')}         ${meta.isNsfw ? c('red', 'Yes') : c('green', 'No')}`);
    console.log(`  ${c('cyan', 'Cloudflare:')}   ${meta.hasCloudflare ? c('yellow', 'Yes') : c('green', 'No')}`);
    console.log(`  ${c('cyan', 'File:')}         ${found.filePath}`);
    console.log(`  ${c('cyan', 'Group:')}        ${group}`);

    if (meta.notes) {
        console.log(`  ${c('cyan', 'Notes:')}        ${meta.notes}`);
    }

    // Check available methods
    try {
        const ext = loadExtension(found.filePath);
        const methods = ['getPopular', 'getLatestUpdates', 'search', 'getDetail', 'getVideoList', 'getPageList', 'getFilterList'];
        const available = methods.filter(m => typeof ext.instance[m] === 'function');
        console.log(`  ${c('cyan', 'Methods:')}      ${available.join(', ')}`);
    } catch (e) {
        console.log(`  ${c('red', 'Methods:')}      Error loading — ${e.message}`);
    }
    console.log('');
}

function cmdValidate(sourceQuery, options) {
    const group = options.group || 'development';

    if (sourceQuery) {
        // Validate a specific extension
        const found = findExtension(sourceQuery, group);
        let targetPath = sourceQuery;

        if (!found.error) {
            targetPath = found.filePath;
        } else if (fs.existsSync(sourceQuery)) {
            targetPath = sourceQuery;
        } else {
            console.error(c('red', '✗ ' + found.error));
            process.exit(1);
        }

        console.log(c('cyan', '  ⚡ Validating Extension: ') + c('bold', path.basename(targetPath)));
        console.log(c('dim', `    Path: ${targetPath}`));
        console.log('');

        const report = validateExtension(targetPath, { targetGroup: group });

        const scoreColor = report.score >= 90 ? 'green' : report.score >= 70 ? 'yellow' : 'red';
        console.log(`  ${c('bold', 'Score:')} ${c(scoreColor, report.score + '/100')}  ${report.valid ? c('green', '✓ PASSED') : c('red', '✗ FAILED')}`);
        console.log('');

        if (report.errors.length > 0) {
            console.log(c('red', `  Errors (${report.errors.length}):`));
            for (const err of report.errors) {
                console.log(`    ${c('red', '✗')} [${err.code}] ${err.message}`);
            }
            console.log('');
        }

        if (report.warnings.length > 0) {
            console.log(c('yellow', `  Warnings (${report.warnings.length}):`));
            for (const warn of report.warnings) {
                console.log(`    ${c('yellow', '⚠')} [${warn.code}] ${warn.message}`);
            }
            console.log('');
        }

        if (report.errors.length === 0 && report.warnings.length === 0) {
            console.log(c('green', '  ✓ Perfect! No errors or warnings found.'));
            console.log('');
        }

        if (!report.valid) {
            process.exit(1);
        }
    } else {
        // Validate whole directory/group
        const dirPath = directories[group];
        if (!dirPath || !fs.existsSync(dirPath)) {
            console.error(c('red', `✗ Directory not found for group '${group}'`));
            process.exit(1);
        }

        console.log(c('cyan', `  ⚡ Validating Group [${group}] Extensions...`));
        console.log(c('dim', `    Directory: ${dirPath}`));
        console.log('');

        const report = validateDirectory(dirPath, { targetGroup: group });

        for (const res of report.results) {
            const status = res.valid ? c('green', '✓ PASS') : c('red', '✗ FAIL');
            const score = c(res.score >= 90 ? 'green' : res.score >= 70 ? 'yellow' : 'red', `${res.score}pts`);
            const name = res.meta ? res.meta.name : res.fileName;
            const issueCount = res.errors.length + res.warnings.length;
            const issues = issueCount > 0 ? c('dim', ` (${res.errors.length} errs, ${res.warnings.length} warns)`) : '';

            console.log(`  ${status}  ${c('bold', name.padEnd(24))} ${score}${issues}`);
        }

        console.log('');
        console.log(c('bold', '  ─────────────────────────'));
        console.log(`  Total: ${report.total} | ` + c('green', `Valid: ${report.validCount}`) + ' | ' + c('red', `Failed: ${report.invalidCount}`) + ` | Avg Score: ${report.avgScore}/100`);
        console.log('');
    }
}

function cmdDeploy(sourceQuery, options) {
    const targetGroup = options.target || 'prod-safe';
    const dryRun = options['dry-run'] !== undefined || options.dryRun !== undefined;
    const force = options.force !== undefined;

    if (!sourceQuery) {
        console.error(c('red', '✗ Missing extension name. Usage: node lightrunner.js deploy <extension> --target prod-safe|prod-nsfw|prod-real'));
        process.exit(1);
    }

    const found = findExtension(sourceQuery, 'development');
    let sourcePath = sourceQuery;

    if (!found.error) {
        sourcePath = found.filePath;
    } else if (fs.existsSync(sourceQuery)) {
        sourcePath = sourceQuery;
    } else {
        console.error(c('red', '✗ ' + found.error));
        process.exit(1);
    }

    console.log(c('cyan', '  ⚡ Deploying Extension...'));
    console.log(c('dim', `    Source:  ${sourcePath}`));
    console.log(c('dim', `    Target:  ${targetGroup}`));
    if (dryRun) console.log(c('yellow', '    Mode:    DRY RUN (simulating changes)'));
    console.log('');

    const result = deployExtension(sourcePath, targetGroup, { dryRun, force });

    if (!result.success) {
        console.error(c('red', '  ✗ Deployment Failed: ') + result.error);
        if (result.validation && result.validation.errors.length > 0) {
            console.log('');
            console.log(c('red', '  Validation Errors:'));
            for (const err of result.validation.errors) {
                console.log(`    ${c('red', '✗')} [${err.code}] ${err.message}`);
            }
        }
        console.log('');
        process.exit(1);
    }

    console.log(c('green', '  ✓ Deployment Successful!') + (dryRun ? c('yellow', ' [DRY RUN]') : ''));
    console.log(`    ${c('cyan', 'Extension:')}     ${result.extensionName}`);
    console.log(`    ${c('cyan', 'Target Repo:')}   ${result.targetRepoName}`);
    console.log(`    ${c('cyan', 'Target Path:')}   ${result.targetPath}`);
    console.log('');
    console.log(c('cyan', '  Patched Metadata:'));
    console.log(`    ${c('dim', 'pkgPath:')}        ${result.patchedMetadata.pkgPath}`);
    console.log(`    ${c('dim', 'sourceCodeUrl:')}  ${result.patchedMetadata.sourceCodeUrl}`);
    console.log('');
}

function cmdCache(positional) {
    const sub = positional[0] || 'stats';
    if (sub === 'clear') {
        globalResponseCache.clear();
        console.log(c('green', '  ✓ Response cache cleared successfully.'));
    } else {
        const stats = globalResponseCache.getStats();
        console.log(c('bold', '  HTTP Response Cache Stats:\n'));
        console.log(`  ${c('cyan', 'Cached Items:')}       ${stats.itemCount} / ${stats.maxSize}`);
        console.log(`  ${c('cyan', 'Cache Hits:')}         ${stats.hits}`);
        console.log(`  ${c('cyan', 'Cache Misses:')}       ${stats.misses}`);
        console.log(`  ${c('cyan', 'Hit Ratio:')}          ${stats.hitRatioPercentage}`);
        console.log(`  ${c('cyan', 'Total Cache Size:')}   ${stats.totalSizeFormatted}`);
        console.log('');
    }
}

function cmdMetrics() {
    const mem = process.memoryUsage();
    const extensions = scanAllExtensions();
    const loaded = extensions.filter(e => !e.error).length;

    console.log(c('bold', '  System & Runtime Metrics:\n'));
    console.log(`  ${c('cyan', 'Node Version:')}       ${process.version}`);
    console.log(`  ${c('cyan', 'Uptime:')}             ${Math.floor(process.uptime())}s`);
    console.log(`  ${c('cyan', 'RSS Memory:')}         ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  ${c('cyan', 'Heap Used:')}          ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  ${c('cyan', 'Heap Total:')}         ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  ${c('cyan', 'Loaded Extensions:')}  ${loaded} / ${extensions.length}`);
    console.log(`  ${c('cyan', 'Compiled Scripts:')}   ${scriptCache.size}`);
    console.log(`  ${c('cyan', 'Cache Items:')}        ${globalResponseCache.getStats().itemCount}`);
    console.log('');
}

// --- Main ---
async function main() {
    const { command, positional, options } = parseArgs();

    if (!command || command === 'help' || command === '--help' || command === '-h') {
        printUsage();
        process.exit(0);
    }

    printBanner();

    switch (command) {
        case 'test': {
            const source = positional[0] || options.source;
            if (!source) {
                console.error(c('red', '  ✗ Missing extension name. Usage: node lightrunner.js test <extension> --action <action>'));
                process.exit(1);
            }
            await cmdTest(source, options);
            break;
        }
        case 'list':
            cmdList(options);
            break;
        case 'health':
            await cmdHealth(options);
            break;
        case 'scaffold':
            cmdScaffold(options);
            break;
        case 'templates':
            cmdTemplates();
            break;
        case 'validate': {
            const source = positional[0] || options.source;
            cmdValidate(source, options);
            break;
        }
        case 'deploy': {
            const source = positional[0] || options.source;
            cmdDeploy(source, options);
            break;
        }
        case 'info': {
            const source = positional[0] || options.source;
            if (!source) {
                console.error(c('red', '  ✗ Missing extension name. Usage: node lightrunner.js info <extension>'));
                process.exit(1);
            }
            cmdInfo(source, options);
            break;
        }
        case 'cache':
            cmdCache(positional);
            break;
        case 'metrics':
            cmdMetrics();
            break;
        default:
            console.error(c('red', `  ✗ Unknown command '${command}'`));
            printUsage();
            process.exit(1);
    }
}

main().catch(e => {
    console.error(c('red', 'Fatal error:'), e);
    process.exit(1);
});
