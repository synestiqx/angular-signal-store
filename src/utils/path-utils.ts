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

import {
  clearJsonPlanCache,
  createJsonPathPlan,
  getJsonPlanCacheStats,
  setJsonPlanCacheLimit,
} from '@synestiqx/jsondb/core/data-engine';

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
  private static readonly normalizedCache = new Map<string, string>();
  private static readonly segmentsCache = new Map<string, readonly string[]>();
  private static readonly validCache = new Map<string, boolean>();
  private static readonly versionPathCache = new Map<string, string>();
  private static readonly cacheMetrics: Record<PathUtilsCacheName, MutablePathUtilsCacheMetrics> = {
    normalized: { hits: 0, misses: 0, writes: 0, evictions: 0 },
    segments: { hits: 0, misses: 0, writes: 0, evictions: 0 },
    valid: { hits: 0, misses: 0, writes: 0, evictions: 0 },
    versionPaths: { hits: 0, misses: 0, writes: 0, evictions: 0 },
  };

  private static recordCacheHit(cacheName: PathUtilsCacheName): void {
    PathUtils.cacheMetrics[cacheName].hits++;
  }

  private static recordCacheMiss(cacheName: PathUtilsCacheName): void {
    PathUtils.cacheMetrics[cacheName].misses++;
  }

  private static cacheSet<K, V>(
    cacheName: PathUtilsCacheName,
    map: Map<K, V>,
    key: K,
    value: V,
    limit = PathUtils.CACHE_MAX
  ): void {
    const existed = map.has(key);
    map.set(key, value);
    if (!existed) PathUtils.cacheMetrics[cacheName].writes++;
    if (map.size > limit) {
      const first = map.keys().next().value as K | undefined;
      if (first !== undefined) {
        map.delete(first);
        PathUtils.cacheMetrics[cacheName].evictions++;
      }
    }
  }

  private static snapshotCacheStats(
    cacheName: PathUtilsCacheName,
    map: Map<unknown, unknown>,
    limit = PathUtils.CACHE_MAX
  ): PathUtilsCacheBucketStats {
    const metrics = PathUtils.cacheMetrics[cacheName];
    const total = metrics.hits + metrics.misses;
    return {
      hits: metrics.hits,
      misses: metrics.misses,
      writes: metrics.writes,
      evictions: metrics.evictions,
      size: map.size,
      limit,
      hitRate: total > 0 ? metrics.hits / total : 0,
    };
  }

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

    const cached = PathUtils.normalizedCache.get(path);
    if (cached !== undefined) {
      PathUtils.recordCacheHit('normalized');
      return cached;
    }
    PathUtils.recordCacheMiss('normalized');

    const normalized = normalizePathCore(path);
    PathUtils.cacheSet('normalized', PathUtils.normalizedCache, path, normalized);
    return normalized;
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
    if (cached !== undefined) {
      PathUtils.recordCacheHit('valid');
      return cached;
    }
    PathUtils.recordCacheMiss('valid');

    const valid = isValidPathCore(path);

    PathUtils.cacheSet('valid', PathUtils.validCache, path, valid);
    return valid;
  }

  static isValidNormalizedPath(normalized: string): boolean {
    if (!normalized || typeof normalized !== 'string') {
      return false;
    }
    const cached = PathUtils.validCache.get(normalized);
    if (cached !== undefined) {
      PathUtils.recordCacheHit('valid');
      return cached;
    }
    PathUtils.recordCacheMiss('valid');
    const valid = isValidNormalizedPathCore(normalized);
    PathUtils.cacheSet('valid', PathUtils.validCache, normalized, valid);
    return valid;
  }

  static splitNormalizedPath(normalized: string): readonly string[] {
    if (!normalized) return [];
    const cached = PathUtils.segmentsCache.get(normalized);
    if (cached !== undefined) {
      PathUtils.recordCacheHit('segments');
      return cached;
    }
    PathUtils.recordCacheMiss('segments');
    const segs = splitPathCore(normalized, { normalize: false });
    PathUtils.cacheSet('segments', PathUtils.segmentsCache, normalized, segs);
    return segs;
  }

  static splitPathExpression(path: string): readonly string[] {
    if (!path) return [];
    // jsondb data-engine is the SSOT for path-expression parsing; its bounded
    // plan cache backs this API, so parsing behaves exactly like inside jsondb.
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
    const normalized = PathUtils.snapshotCacheStats('normalized', PathUtils.normalizedCache);
    const segments = PathUtils.snapshotCacheStats('segments', PathUtils.segmentsCache);
    const planStats = getJsonPlanCacheStats();
    const expressions: PathUtilsCacheBucketStats = {
      hits: planStats.hits,
      misses: planStats.misses,
      writes: planStats.writes,
      evictions: planStats.evictions,
      size: planStats.size,
      limit: planStats.limit,
      hitRate: planStats.hitRate,
    };
    const valid = PathUtils.snapshotCacheStats('valid', PathUtils.validCache);
    const versionPaths = PathUtils.snapshotCacheStats('versionPaths', PathUtils.versionPathCache);
    const hits = normalized.hits + segments.hits + expressions.hits + valid.hits + versionPaths.hits;
    const misses = normalized.misses + segments.misses + expressions.misses + valid.misses + versionPaths.misses;
    return {
      normalized,
      segments,
      expressions,
      valid,
      versionPaths,
      total: {
        hits,
        misses,
        writes: normalized.writes + segments.writes + expressions.writes + valid.writes + versionPaths.writes,
        evictions: normalized.evictions + segments.evictions + expressions.evictions + valid.evictions + versionPaths.evictions,
        size: normalized.size + segments.size + expressions.size + valid.size + versionPaths.size,
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
    PathUtils.normalizedCache.clear();
    PathUtils.segmentsCache.clear();
    PathUtils.validCache.clear();
    PathUtils.versionPathCache.clear();
    clearJsonPlanCache();
    for (const metrics of Object.values(PathUtils.cacheMetrics)) {
      metrics.hits = 0;
      metrics.misses = 0;
      metrics.writes = 0;
      metrics.evictions = 0;
    }
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
    const cached = PathUtils.versionPathCache.get(cacheKey);
    if (cached !== undefined) {
      PathUtils.recordCacheHit('versionPaths');
      return cached;
    }
    PathUtils.recordCacheMiss('versionPaths');
    const resolved = resolveVersionPathCore(normalized, options);
    PathUtils.cacheSet('versionPaths', PathUtils.versionPathCache, cacheKey, resolved);
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
