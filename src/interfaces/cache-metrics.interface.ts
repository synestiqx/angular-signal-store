// src/app/store/interfaces/cache-metrics.interface.ts

/**
 * Interface for cache metrics/statistics.
 */
export interface ICacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
} 