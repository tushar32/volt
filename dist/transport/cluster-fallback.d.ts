import type { ResolvedConfig } from '../config/config.js';
/**
 * Windows / non-SO_REUSEPORT fallback using the cluster module.
 *
 * Uses the standard Node.js cluster pattern:
 *   Primary → forks N child processes
 *   Each child → calls create() and listens on the same port
 *   The cluster module distributes connections via IPC (round-robin on most OS)
 *
 * This has ~30% more overhead than SO_REUSEPORT but works everywhere.
 */
export declare function startWithCluster(config: ResolvedConfig): Promise<void>;
//# sourceMappingURL=cluster-fallback.d.ts.map