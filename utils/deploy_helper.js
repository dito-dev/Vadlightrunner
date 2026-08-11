/**
 * Deployment Helper Utility
 * 
 * Automates moving extensions from development to production repositories
 * while enforcing pre-deployment validation, target safety rules, and auto-patching
 * metadata fields (pkgPath & sourceCodeUrl).
 */

const fs = require('fs');
const path = require('path');
const { validateExtension } = require('./extension_validator');

// ── Target Repository Configuration ──
const TARGET_CONFIGS = {
    'prod-safe': {
        name: 'prod_extension2 (Non-NSFW)',
        dirPath: path.join(__dirname, '../../prod_extension-main/working/'),
        pkgPathPrefix: 'working/',
        sourceCodeUrlTemplate: 'https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/',
        allowNsfw: false
    },
    'prod-nsfw': {
        name: 'yomiextensionreal (NSFW)',
        dirPath: path.join(__dirname, '../../yomiextensionreal-main/nsfw/'),
        pkgPathPrefix: 'nsfw/',
        sourceCodeUrlTemplate: 'https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/',
        allowNsfw: true
    },
    'prod-real': {
        name: 'yomiextensionreal (Specialized Players)',
        dirPath: path.join(__dirname, '../../yomiextensionreal-main/real/'),
        pkgPathPrefix: 'real/',
        sourceCodeUrlTemplate: 'https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/real/',
        allowNsfw: true
    }
};

/**
 * Auto-patch metadata fields (pkgPath and sourceCodeUrl) in extension JS content.
 * 
 * @param {string} codeContent - Original JS code content
 * @param {string} newPkgPath - New pkgPath value
 * @param {string} newSourceUrl - New sourceCodeUrl value
 * @returns {string} Patched JS code content
 */
function patchMetadataFields(codeContent, newPkgPath, newSourceUrl) {
    let patched = codeContent;

    // Patch "pkgPath": "..."
    patched = patched.replace(
        /((?:"|')pkgPath(?:"|')\s*:\s*")[^"]*(")/g,
        `$1${newPkgPath}$2`
    );

    // Patch "sourceCodeUrl": "..."
    patched = patched.replace(
        /((?:"|')sourceCodeUrl(?:"|')\s*:\s*")[^"]*(")/g,
        `$1${newSourceUrl}$2`
    );

    return patched;
}

/**
 * Deploy an extension file from development to a production repository.
 * 
 * @param {string} sourceFilePath - Absolute or relative path to the development extension .js file
 * @param {string} targetGroup - Target group ('prod-safe', 'prod-nsfw', 'prod-real')
 * @param {Object} [options] - Deployment options
 * @param {boolean} [options.dryRun=false] - If true, simulate deployment without writing files
 * @param {boolean} [options.force=false] - Bypass warnings (critical errors still block)
 * @returns {Object} Deployment result report
 */
function deployExtension(sourceFilePath, targetGroup, options = {}) {
    const absoluteSourcePath = path.resolve(sourceFilePath);
    const fileName = path.basename(absoluteSourcePath);
    const dryRun = options.dryRun || false;
    const force = options.force || false;

    // 1. Verify target group validity
    const targetConfig = TARGET_CONFIGS[targetGroup];
    if (!targetConfig) {
        return {
            success: false,
            fileName,
            targetGroup,
            error: `Invalid target group '${targetGroup}'. Must be one of: ${Object.keys(TARGET_CONFIGS).join(', ')}`
        };
    }

    // 2. Verify source file existence
    if (!fs.existsSync(absoluteSourcePath)) {
        return {
            success: false,
            fileName,
            targetGroup,
            error: `Source file does not exist: ${absoluteSourcePath}`
        };
    }

    // 3. Perform pre-deployment validation using Extension Validator
    const validation = validateExtension(absoluteSourcePath, { targetGroup });

    if (!validation.valid && !force) {
        return {
            success: false,
            fileName,
            targetGroup,
            validation,
            error: `Pre-deployment validation failed with ${validation.errors.length} critical error(s). Fix errors or use --force to override.`
        };
    }

    // Check NSFW policy
    if (validation.meta && validation.meta.isNsfw && !targetConfig.allowNsfw) {
        return {
            success: false,
            fileName,
            targetGroup,
            validation,
            error: `CRITICAL SAFETY POLICY VIOLATION: Extension '${validation.meta.name}' is flagged NSFW (isNsfw: true) and CANNOT be deployed to '${targetGroup}' (${targetConfig.name}).`
        };
    }

    // 4. Calculate target paths & metadata patches
    const targetDirPath = targetConfig.dirPath;
    const targetFilePath = path.join(targetDirPath, fileName);

    const newPkgPath = `${targetConfig.pkgPathPrefix}${fileName}`;
    const newSourceUrl = `${targetConfig.sourceCodeUrlTemplate}${fileName}`;

    // Read source code and patch metadata
    const sourceCode = fs.readFileSync(absoluteSourcePath, 'utf8');
    const patchedCode = patchMetadataFields(sourceCode, newPkgPath, newSourceUrl);

    // 5. Execute copy / patch (or simulate in dry-run mode)
    let fileWritten = false;
    if (!dryRun) {
        // Ensure target directory exists
        if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true });
        }
        fs.writeFileSync(targetFilePath, patchedCode, 'utf8');
        fileWritten = true;

        // Auto-regenerate index files (anime_index.json & index.json) in target repo
        try {
            const { updateSingleRepoIndex } = require('./update_repo_index');
            const repoRoot = path.resolve(targetDirPath, '..');
            const baseUrl = targetConfig.sourceCodeUrlTemplate.replace(/working\/|nsfw\/|real\/$/, '');
            updateSingleRepoIndex(repoRoot, baseUrl);
        } catch (idxErr) {
            console.warn('Index auto-update warning:', idxErr.message);
        }
    }

    return {
        success: true,
        fileName,
        extensionName: validation.meta ? validation.meta.name : fileName,
        sourcePath: absoluteSourcePath,
        targetPath: targetFilePath,
        targetGroup,
        targetRepoName: targetConfig.name,
        dryRun,
        fileWritten,
        patchedMetadata: {
            pkgPath: newPkgPath,
            sourceCodeUrl: newSourceUrl
        },
        validation
    };
}

module.exports = {
    deployExtension,
    TARGET_CONFIGS,
    patchMetadataFields
};
