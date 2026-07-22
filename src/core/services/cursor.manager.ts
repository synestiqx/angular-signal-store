import { FlatStoreMap } from '../../utils/flat-store-map';
import {
  JsonDataCursor,
  createJsonPathPlan,
  type JsonPathPlan,
} from '@synestiqx/jsnq/data-engine';

type PathPlan = JsonPathPlan;

/**
 * CursorManager - optimized path traversal with caching.
 * Uses FlatStoreMap for better performance than plain Record.
 */
export class CursorManager {
  private pathSetPlanCache = new FlatStoreMap<PathPlan>();
  private cursor = new JsonDataCursor();

  applyPathPlan(normalizedPath: string): PathPlan {
    return this.pathSetPlanCache.getOrCreate(normalizedPath, (normalized) => createJsonPathPlan(normalized));
  }

  prefetch(path: string, node: Record<string, unknown> | null): void {
    this.cursor.prefetch(path, node);
  }

  mutateNode(root: Record<string, unknown>, plan: PathPlan, normalizedPath: string, value: unknown): unknown {
    const effectivePlan = plan.path === normalizedPath ? plan : createJsonPathPlan(normalizedPath);
    const result = this.cursor.writeWithPlan(root, effectivePlan, value);
    return result.previous;
  }

  invalidateCache(normalizedPath: string): void {
    this.pathSetPlanCache.deleteByPrefix(normalizedPath);
  }

  invalidateForDeletion(normalizedPath: string): void {
    this.cursor.invalidateForDeletion(normalizedPath);
  }

  /**
   * Get cache statistics for performance monitoring.
   */
  getCacheStats(): { pathPlanCache: ReturnType<FlatStoreMap<PathPlan>['getCacheStats']>; cursorActive: boolean } {
    return {
      pathPlanCache: this.pathSetPlanCache.getCacheStats(),
      cursorActive: this.cursor.active,
    };
  }

  /**
   * Clear all caches (useful for testing or memory management).
   */
  clearCaches(): void {
    this.pathSetPlanCache.clear();
    this.cursor.clear();
  }
}
