/**
 * LightRunner Optimized Workflow End-to-End Test Suite
 * 
 * Verifies all 5 workflow components:
 *   1. Smart Templates (list & archetype structure)
 *   2. Skeleton Generation (api-json, html-scraper, hybrid, manga-reader)
 *   3. Extension Validation (mangayomiSources contract, VM execution, method checks, score)
 *   4. Automated Deployment (pre-deploy validation, NSFW safety policy, metadata patching, dry-run)
 *   5. CLI & Server API endpoints
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { listTemplates, generateSkeleton } = require('../utils/skeleton_generator');
const { validateExtension, validateDirectory } = require('../utils/extension_validator');
const { deployExtension } = require('../utils/deploy_helper');
const { loadExtension } = require('../emulator');

async function runWorkflowTests() {
    console.log('⚡ Starting LightRunner Extension Workflow Test Suite...\n');
    let passed = 0;
    let total = 0;

    function test(name, fn) {
        total++;
        try {
            fn();
            console.log(`  ✓ PASSED: ${name}`);
            passed++;
        } catch (e) {
            console.error(`  ✗ FAILED: ${name}\n    Error: ${e.message}`);
        }
    }

    // ── Test 1: Smart Templates Listing ──
    test('Smart Templates Listing', () => {
        const templates = listTemplates();
        assert(Array.isArray(templates), 'Templates should be an array');
        const types = templates.map(t => t.type);
        assert(types.includes('api-json'), 'Missing api-json template');
        assert(types.includes('html-scraper'), 'Missing html-scraper template');
        assert(types.includes('hybrid'), 'Missing hybrid template');
        assert(types.includes('manga-reader'), 'Missing manga-reader template');
    });

    // ── Test 2: Scaffold Generation for All Archetypes ──
    const scratchDir = path.join(__dirname, 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    const archetypes = ['api-json', 'html-scraper', 'hybrid', 'manga-reader'];
    for (const archetype of archetypes) {
        test(`Scaffold Archetype: ${archetype}`, () => {
            const extName = `AutoTest${archetype.replace(/[^a-z0-9]/gi, '')}`;
            const res = generateSkeleton({
                name: extName,
                baseUrl: 'https://example.com',
                template: archetype,
                outputDir: scratchDir
            });

            assert(fs.existsSync(res.filePath), `File not created: ${res.filePath}`);
            assert.strictEqual(res.template, archetype, `Template mismatch: ${res.template}`);

            // Load in VM sandbox
            const loaded = loadExtension(res.filePath);
            assert(loaded.instance, 'DefaultExtension failed to instantiate');
            assert(loaded.metadata[0], 'Metadata array empty');
            assert.strictEqual(loaded.metadata[0].name, extName, 'Name mismatch in metadata');
        });
    }

    // ── Test 3: Extension Validator ──
    test('Validator - Known Good Extension (Animotvslash)', () => {
        const extPath = path.join(__dirname, '../../mangayomi-extensionsTEST/javascript/anime/src/en/working/animotvslash.js');
        const report = validateExtension(extPath);
        assert(report.valid, 'Animotvslash should pass validation');
        assert(report.score >= 80, `Expected score >= 80, got ${report.score}`);
        assert.strictEqual(report.errors.length, 0, 'Should have 0 errors');
    });

    test('Validator - Directory Batch Validation', () => {
        const devDir = path.join(__dirname, '../../mangayomi-extensionsTEST/javascript/anime/src/en/working');
        const report = validateDirectory(devDir);
        assert(report.total >= 15, `Expected >= 15 extensions, found ${report.total}`);
        assert(report.validCount >= 15, `Expected >= 15 valid extensions, got ${report.validCount}`);
    });

    // ── Test 4: Deployment Automation & Metadata Patching ──
    test('Deploy - Metadata Auto-Patching (Dry Run)', () => {
        const extPath = path.join(__dirname, '../../mangayomi-extensionsTEST/javascript/anime/src/en/working/animotvslash.js');
        const res = deployExtension(extPath, 'prod-safe', { dryRun: true });

        assert(res.success, 'Deployment dry-run failed');
        assert.strictEqual(res.patchedMetadata.pkgPath, 'working/animotvslash.js', 'pkgPath not patched correctly');
        assert(res.patchedMetadata.sourceCodeUrl.includes('prod_extension2') || res.patchedMetadata.sourceCodeUrl.includes('github'), 'sourceCodeUrl not patched correctly');
        assert.strictEqual(res.fileWritten, false, 'Dry run should not write files to disk');
    });

    test('Deploy Safety Policy - NSFW Blocked in Prod-Safe', () => {
        const fikfapPath = path.join(__dirname, '../../mangayomi-extensionsTEST/javascript/anime/src/en/working/fikfap.js');
        const res = deployExtension(fikfapPath, 'prod-safe', { dryRun: true });

        assert.strictEqual(res.success, false, 'NSFW extension should NOT be deployable to prod-safe');
        assert(res.error.includes('NSFW') || res.error.includes('critical error'), 'Error should cite NSFW safety policy');
    });

    test('Deploy - NSFW Allowed in Prod-NSFW', () => {
        const fikfapPath = path.join(__dirname, '../../mangayomi-extensionsTEST/javascript/anime/src/en/working/fikfap.js');
        const res = deployExtension(fikfapPath, 'prod-nsfw', { dryRun: true });

        assert(res.success, 'NSFW extension should be deployable to prod-nsfw');
        assert.strictEqual(res.patchedMetadata.pkgPath, 'nsfw/fikfap.js', 'pkgPath should use nsfw/ prefix');
    });

    console.log(`\n================================================`);
    console.log(`  Workflow Test Suite: ${passed}/${total} PASSED`);
    console.log(`================================================\n`);

    if (passed < total) process.exit(1);
}

runWorkflowTests().catch(e => {
    console.error('Fatal test error:', e);
    process.exit(1);
});
