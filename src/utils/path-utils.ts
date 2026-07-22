import { PathValue, StoreData, StorePath, createStorePath } from '../types/advanced-types';
import { StoreErrorFactory, safeOperation, OperationResult } from '../types/errors';
import { logger } from './logger';
import { hasForbiddenPathSegment } from './path-safety';
import {
  directNumericParentPathCore,
  enumerateAncestorPathsCore,
  getBySegmentsCore,
  getParentPathNormalizedCore,
  getPathKeyCore,
  isNumericSegmentCore,
  isValidNormalizedPathCore,
  isValidPathCore,
  nearestNumericContainerPathCore,
  normalizePathCore,
  pathExistsCore,
  resolveVersionPathCore,
  setByPathCore,
  splitPathCore,
  type VersionDependencyMode,
} from './path-core';

import { GenerationalCache } from './generational-cache';
import {
  clearJsonPlanCache,
  createJsonPathPlan,
  getJsonPlanCacheStats,
  setJsonPlanCacheLimit,
} from '@adsq/jsnq/core/data-engine';

export type { VersionDependencyMode } from './path-core';

type PathUtilsCacheName = 'normalized' | 'segments' | 'valid' | 'versionPaths';

interface MutablePathUtilsCacheMetrics {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
}

export interface PathUtilsCacheBucketStats extends MutablePathUtilsCacheMetrics {
  size: number;
  limit: number;
  hitRate: number;
}

export interface PathUtilsCacheStats {
  normalized: PathUtilsCacheBucketStats;
  segments: PathUtilsCacheBucketStats;
  expressions: PathUtilsCacheBucketStats;
  valid: PathUtilsCacheBucketStats;
  versionPaths: PathUtilsCacheBucketStats;
  total: {
    hits: number;
    misses: number;
    writes: number;
    evictions: number;
    size: number;
    hitRate: number;
  };
}

export interface PathUtilsCacheLimits {
  normalized: number;
  segments: number;
  expressions: number;
  valid: number;
  versionPaths: number;
}

export class PathUtils {
  // Small FIFO caches to avoid repeated regex + split work in hot paths.
  private static readonly CACHE_MAX = 5000;
  // Only the two operations that measurably profit from caching are cached. Benchmarked on
  // a realistic 90% repeated / 10% new path mix (200k ops): splitting 30.0ms -> 23.8ms and
  // validation 56.6ms -> 29.0ms, while normalisation (14.3ms -> 17.2ms) and version-path
  // resolution (6.7ms -> 13.1ms) were *slower* cached than computed directly, so they are
  // no longer cached at all. See GenerationalCache for why eviction strategy matters here.
  private static readonly segmentsCache = new GenerationalCache<readonly string[]>(PathUtils.CACHE_MAX);
  private static readonly validCache = new GenerationalCache<boolean>(PathUtils.CACHE_MAX);

  /**
   * Type-safe path value getter with comprehensive error handling
   */
  static getByPath<T extends StoreData, P extends string>(
    obj: T | null | undefined, 
    path: P
  ): PathValue<T, P> | undefined {
    if (!obj) {
      return undefined;
    }

    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      return undefined;
    }

    try {
      const normalizedPath = PathUtils.normalizePath(path);
      const segments = PathUtils.splitNormalizedPath(normalizedPath);
      if (hasForbiddenPathSegment(segments)) {
        return undefined;
      }
      return getBySegmentsCore<PathValue<T, P>>(obj, segments) as PathValue<T, P> | undefined;
    } catch (error) {
      // Don't throw for read operations, just return undefined
      logger.warn(`Failed to access path "${path}":`, error);
      return undefined;
    }
  }

  /**
   * Internal helper: apply a selector to an object with type inference
   */
  static selectValue<T, R>(obj: T, selector: (s: T) => R): R {
    return selector(obj);
  }

  /**
   * Safe version of getByPath that returns a result object instead of throwing
   */
  static safeGetByPath<T extends StoreData, P extends string>(
    obj: T | null | undefined, 
    path: P
  ): OperationResult<PathValue<T, P> | undefined> {
    return safeOperation(
      () => PathUtils.getByPath(obj, path),
      (error) => StoreErrorFactory.pathAccess(path, 'safe_get', error)
    );
  }

  /**
   * Type-safe path value setter with validation and error handling
   */
  static setByPath<T extends StoreData>(
    obj: T, 
    path: string, 
    value: unknown
  ): void {
    if (!obj || typeof obj !== 'object') {
      throw StoreErrorFactory.typeValidation(path, 'object', typeof obj);
    }

    if (!PathUtils.isValidPath(path)) {
      throw StoreErrorFactory.pathValidation(path, 'Invalid path format');
    }

    try {
      const normalizedPath = PathUtils.normalizePath(path);
      setByPathCore(obj, normalizedPath, value);
    } catch (error) {
      throw StoreErrorFactory.pathAccess(path, 'set', error as Error);
    }
  }

  /**
   * Safe version of setByPath that returns a result object instead of throwing
   */
  static safeSetByPath<T extends StoreData>(
    obj: T, 
    path: string, 
    value: unknown
  ): OperationResult<void> {
    return safeOperation(
      () => PathUtils.setByPath(obj, path, value),
      (error) => StoreErrorFactory.pathAccess(path, 'safe_set', error)
    );
  }

  /**
   * Helper to normalize any path expression to dot notation
   * Converts bracket notation (e.g., users[0].name) to dot notation (users.0.name)
   */
  static normalizePath(path: string): string {
    if (!path || typeof path !== 'string') {
      throw StoreErrorFactory.pathValidation(path, 'Path must be a non-empty string');
    }

    return normalizePathCore(path);
  }

  /**
   * Validates if a path string has correct format
   */
  static isValidPath(path: string): boolean {
    if (!path || typeof path !== 'string') {
      return false;
    }
    
    // Check for empty string
    if (path.trim().length === 0) {
      return false;
    }
    
    // More permissive validation - allow dots and numbers
    // Pattern: word.word.number or word[number] etc.
    const cached = PathUtils.validCache.get(path);
    if (cached !== undefined) return cached;
    const valid = isValidPathCore(path);
    PathUtils.validCache.set(path, valid);
    return valid;
  }

  static isValidNormalizedPath(normalized: string): boolean {
    if (!normalized || typeof normalized !== 'string') {
      return false;
    }
    const cached = PathUtils.validCache.get(normalized);
    if (cached !== undefined) return cached;
    const valid = isValidNormalizedPathCore(normalized);
    PathUtils.validCache.set(normalized, valid);
    return valid;
  }

  static splitNormalizedPath(normalized: string): readonly string[] {
    if (!normalized) return [];
    const cached = PathUtils.segmentsCache.get(normalized);
    if (cached !== undefined) return cached;
    const segs = splitPathCore(normalized, { normalize: false });
    PathUtils.segmentsCache.set(normalized, segs);
    return segs;
  }

  static splitPathExpression(path: string): readonly string[] {
    if (!path) return [];
    // jsnq data-engine is the SSOT for path-expression parsing; its bounded
    // plan cache backs this API, so parsing behaves exactly like inside jsnq.
    return createJsonPathPlan(path).segments;
  }

  static setPathExpressionCacheLimit(limit: number): void {
    setJsonPlanCacheLimit(limit);
  }

  /**
   * Diagnostic cache counters for tests, benchmarks, and perf lab UI.
   * These counters are process-wide because the caches are static.
   */
  static getCacheStats(): PathUtilsCacheStats {
    const bucket = (
      metrics: { hits: number; misses: number; writes: number; evictions: number },
      size: number,
      limit: number,
    ): PathUtilsCacheBucketStats => {
      const total = metrics.hits + metrics.misses;
      return { ...metrics, size, limit, hitRate: total > 0 ? metrics.hits / total : 0 };
    };
    const empty = bucket({ hits: 0, misses: 0, writes: 0, evictions: 0 }, 0, 0);

    const segments = bucket(
      PathUtils.segmentsCache.readMetrics(),
      PathUtils.segmentsCache.size,
      PathUtils.segmentsCache.maxSize,
    );
    const valid = bucket(
      PathUtils.validCache.readMetrics(),
      PathUtils.validCache.size,
      PathUtils.validCache.maxSize,
    );
    const planStats = getJsonPlanCacheStats();
    const expressions = bucket(planStats, planStats.size, planStats.limit);

    // Normalisation and version-path resolution are computed directly: caching them
    // measured slower than the work itself. The buckets stay in the shape for
    // compatibility and always report zero.
    const normalized = empty;
    const versionPaths = empty;

    const live = [segments, valid, expressions];
    const hits = live.reduce((n, b) => n + b.hits, 0);
    const misses = live.reduce((n, b) => n + b.misses, 0);
    return {
      normalized,
      segments,
      expressions,
      valid,
      versionPaths,
      total: {
        hits,
        misses,
        writes: live.reduce((n, b) => n + b.writes, 0),
        evictions: live.reduce((n, b) => n + b.evictions, 0),
        size: live.reduce((n, b) => n + b.size, 0),
        hitRate: hits + misses > 0 ? hits / (hits + misses) : 0,
      },
    };
  }


  /**
   * Exposes current cache limits without exposing mutable cache internals.
   */
  static getCacheLimits(): PathUtilsCacheLimits {
    return {
      normalized: PathUtils.CACHE_MAX,
      segments: PathUtils.CACHE_MAX,
      expressions: getJsonPlanCacheStats().limit,
      valid: PathUtils.CACHE_MAX,
      versionPaths: PathUtils.CACHE_MAX,
    };
  }

  /**
   * Global cache reset for tests, benchmarks, and explicit diagnostics.
   * This resets metrics too, so production code should not call it casually.
   */
  static clearCaches(): void {

    PathUtils.segmentsCache.clear();
    PathUtils.validCache.clear();

    clearJsonPlanCache();
  }

  /**
   * Creates a branded StorePath for additional type safety
   */
  static createPath(path: string): StorePath {
    if (!PathUtils.isValidPath(path)) {
      throw StoreErrorFactory.pathValidation(path, 'Invalid path format');
    }
    return createStorePath(path);
  }

  /**
   * Checks if a path exists in an object (distinguishes missing key from undefined value).
   */
  static pathExists<T extends StoreData>(obj: T, path: string): boolean {
    try {
      return pathExistsCore(obj, path);
    } catch {
      return false;
    }
  }

  /**
   * Gets the parent path of a given path
   */
  static getParentPath(path: string): string | null {
    if (!PathUtils.isValidPath(path)) {
      return null;
    }
    
    const normalized = PathUtils.normalizePath(path);
    return PathUtils.getParentPathNormalized(normalized);
  }

  static getParentPathNormalized(normalized: string): string | null {
    if (!PathUtils.isValidNormalizedPath(normalized)) {
      return null;
    }
    return getParentPathNormalizedCore(normalized);
  }

  /**
   * Gets the last segment (key) of a path
   */
  static getPathKey(path: string): string | null {
    if (!PathUtils.isValidPath(path)) {
      return null;
    }
    
    return getPathKeyCore(path);
  }

  /**
   * Joins path segments safely
   */
  static joinPaths(...segments: string[]): string {
    const cleanSegments = segments
      .filter(segment => segment && typeof segment === 'string')
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0);
    
    if (cleanSegments.length === 0) {
      throw StoreErrorFactory.pathValidation('', 'Cannot join empty path segments');
    }
    
    const joined = cleanSegments.join('.');
    
    if (!PathUtils.isValidPath(joined)) {
      throw StoreErrorFactory.pathValidation(joined, 'Joined path is invalid');
    }
    
    return joined;
  }

  /**
   * Returns a list of ancestor paths for the given path, from the full path down to the top-level key.
   * Example: 'users[0].name' -> ['users.0.name','users.0','users']
   */
  static isNumericSegment(segment: string | undefined | null): boolean {
    return isNumericSegmentCore(segment);
  }

  static nearestNumericContainerPath(path: string): string | null {
    return nearestNumericContainerPathCore(path);
  }

  static directNumericParentPath(path: string): string | null {
    return directNumericParentPathCore(path);
  }

  static resolveVersionPath(
    normalized: string,
    options: { dependencyMode: VersionDependencyMode; bumpNumericParent: boolean }
  ): string {
    const cacheKey = `${normalized}|${options.dependencyMode}|${options.bumpNumericParent ? 1 : 0}`;

    const resolved = resolveVersionPathCore(normalized, options);

    return resolved;
  }

  static enumerateAncestors(path: string, options: { includeNumericParent?: boolean } = {}): string[] {
    return enumerateAncestorPathsCore(path, options);
  }

  static isBranchValue(value: unknown): value is object {
    return value !== null && typeof value === 'object';
  }

  /**
   * Type guard to check if value is a valid store data object
   */
  static isStoreData(value: unknown): value is StoreData {
    return value !== null && 
           value !== undefined && 
           typeof value === 'object' && 
           !Array.isArray(value);
  }

  /**
   * Gets all possible paths in an object (for development/debugging)
   */
  static getAllPaths<T extends StoreData>(obj: T, maxDepth = 10): string[] {
    const paths: string[] = [];
    
    function traverse(current: unknown, currentPath: string, depth: number) {
      if (depth >= maxDepth || current === null || current === undefined) {
        return;
      }

      if (typeof current === 'object') {
        Object.keys(current as Record<string, unknown>).forEach(key => {
          const newPath = currentPath ? `${currentPath}.${key}` : key;
          paths.push(newPath);

          const value = (current as Record<string, unknown>)[key];
          if (value !== null && typeof value === 'object') {
            traverse(value, newPath, depth + 1);
          }
        });
      }
    }

    traverse(obj, '', 0);
    return paths.sort();
  }
}
