import type { Server } from 'node:http';
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
export declare function loadApp(appPath: string): Promise<Server>;
//# sourceMappingURL=app-loader.d.ts.map