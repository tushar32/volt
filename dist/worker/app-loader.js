import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
/**
 * Loads the user's application module.
 *
 * The module must export a `create()` function that returns
 * an http.Server (or a Promise resolving to one).
 *
 * Supported export shapes:
 *   export function create() { ... }
 *   export default function create() { ... }
 *   export default { create() { ... } }
 *   module.exports = { create() { ... } }
 */
export async function loadApp(appPath) {
    const absolutePath = resolveAppPath(appPath);
    const appModule = await import(pathToFileURL(absolutePath).href);
    const create = findCreateFunction(appModule);
    if (!create) {
        throw new Error(`[volt] App module "${appPath}" must export a create() function that returns an http.Server.\n` +
            `  Supported patterns:\n` +
            `    export function create() { return createServer(...) }\n` +
            `    export default function() { return createServer(...) }\n` +
            `    module.exports.create = () => createServer(...)`);
    }
    const result = await create();
    if (!result || typeof result.listen !== 'function') {
        throw new Error(`[volt] create() must return an http.Server (or a Promise of one). Got: ${typeof result}`);
    }
    return result;
}
/**
 * Resolve the app path to an absolute file path.
 * Tries common extensions and index files.
 */
function resolveAppPath(appPath) {
    const abs = resolve(process.cwd(), appPath);
    // Direct file reference
    const candidates = [
        abs,
        `${abs}.js`,
        `${abs}.mjs`,
        `${abs}.cjs`,
        resolve(abs, 'index.js'),
        resolve(abs, 'index.mjs'),
        resolve(abs, 'index.cjs'),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error(`[volt] Cannot find app module: ${appPath} (tried: ${candidates.join(', ')})`);
}
/**
 * Extract the create function from a module, supporting multiple export shapes.
 */
function findCreateFunction(mod) {
    // export function create() { ... }
    if (typeof mod.create === 'function')
        return mod.create;
    // export default function create() { ... } OR export default { create() { ... } }
    if (mod.default) {
        if (typeof mod.default === 'function')
            return mod.default;
        if (typeof mod.default.create === 'function')
            return mod.default.create;
    }
    return null;
}
//# sourceMappingURL=app-loader.js.map