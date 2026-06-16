/**
 * Universal cache metrics tracker.
 * Eliminates duplicated metrics logic in ProxyCacheManager, FlatStoreMap, etc.
 */
export class CacheMetricsTracker {
  private hits = 0;
  private misses = 0;

  hit(): void { this.hits++; }
  miss(): void { this.misses++; }

  snapshot(): { hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
