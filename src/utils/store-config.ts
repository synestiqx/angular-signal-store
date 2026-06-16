/**
 * Centralized configuration constants for the store.
 * Eliminates magic numbers and provides single source of truth for defaults.
 */
export class StoreConfig {
  // Metrics and performance
  static readonly METRICS_THROTTLE_MS = 250;
  static readonly METRICS_INTERVAL_MS = 2000;

  // Cleanup and garbage collection
  static readonly BEHAVIOR_CLEANUP_DELAY_MS = 50;
  static readonly CURSOR_RESET_DELAY_MS = 0; // microtask

  // Cache limits
  static readonly PROXY_CACHE_MAX_SIZE = 1000;
  static readonly PATH_PLAN_CACHE_MAX_SIZE = 500;

  // Batch operations
  static readonly VERSION_BUMP_BATCH_DELAY_MS = 0; // microtask via Promise.resolve()
  static readonly AUTO_BATCH_BUMPS_DEFAULT = false;

  // Version bump optimization
  static readonly VERSION_BUMP_STRATEGY_DEFAULT: 'microtask' | 'raf' = 'microtask';
  static readonly VERSION_BUMP_THROTTLE_MS_DEFAULT = 0;
  static readonly VERSION_PARTIAL_INVALIDATION_DEFAULT = false;

  // DevTools
  static readonly DEVTOOLS_EMIT_THROTTLE_MS = 50;

  // Dependency tracking
  static readonly DEPENDENCY_MODE_DEFAULT: 'exact' | 'container' = 'exact';
  static readonly TRACK_READS_DEFAULT = true;
  static readonly CLONE_COMPUTED_OUTPUTS_DEFAULT = true;
  static readonly BEHAVIOR_UPDATES_ENABLED_DEFAULT = true;
  static readonly BUMP_NUMERIC_PARENT_DEFAULT = true;
}
