import * as i0 from '@angular/core';
import { computed, signal, InjectionToken, Optional, Inject, Injectable } from '@angular/core';
import { createJsonPathPlan, setJsonPlanCacheLimit, getJsonPlanCacheStats, clearJsonPlanCache, cloneJsonData } from '@synestiqx/jsnq/core/data-engine';
import { JsonDataCursor, createJsonPathPlan as createJsonPathPlan$1 } from '@synestiqx/jsnq/data-engine';
import { BehaviorSubject, Observable, combineLatest, EMPTY } from 'rxjs';
import JsnqPipeline from '@synestiqx/jsnq/core/pipeline';
import { tryFastPipelineMutation, collectPipelineIntent, tryFastStructuralMutation, isDeepSugarAction, applyDeepSugarPatch } from '@synestiqx/jsnq/core/pipeline-fastpath';

// src/app/store/types/errors.ts
// Base store error class
class BaseStoreError extends Error {
    type;
    path;
    originalError;
    timestamp = Date.now();
    constructor(type, message, path, originalError) {
        super(message);
        this.type = type;
        this.path = path;
        this.originalError = originalError;
        this.name = this.constructor.name;
        // Maintain proper stack trace for V8
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
// Specific error classes
class PathAccessError extends BaseStoreError {
    constructor(path, operation, originalError) {
        super('PATH_ERROR', `Failed to access path "${path}" during ${operation}`, path, originalError);
    }
}
class PathValidationError extends BaseStoreError {
    constructor(path, reason) {
        super('VALIDATION_ERROR', `Invalid path "${path}": ${reason}`, path);
    }
}
class TypeValidationError extends BaseStoreError {
    constructor(path, expectedType, actualType) {
        super('TYPE_ERROR', `Type mismatch at path "${path}": expected ${expectedType}, got ${actualType}`, path);
    }
}
class ArrayOperationError extends BaseStoreError {
    constructor(path, operation, reason, originalError) {
        super('ARRAY_ERROR', `Array operation "${operation}" failed at path "${path}": ${reason}`, path, originalError);
    }
}
class ProxyOperationError extends BaseStoreError {
    constructor(path, operation, originalError) {
        super('PROXY_ERROR', `Proxy operation "${operation}" failed at path "${path}"`, path, originalError);
    }
}
class ComputeOperationError extends BaseStoreError {
    constructor(path, reason, originalError) {
        super('COMPUTE_ERROR', `Compute operation failed at path "${path}": ${reason}`, path, originalError);
    }
}
// Error factory for consistent error creation
class StoreErrorFactory {
    static pathAccess(path, operation, originalError) {
        return new PathAccessError(path, operation, originalError);
    }
    static pathValidation(path, reason) {
        return new PathValidationError(path, reason);
    }
    static typeValidation(path, expectedType, actualType) {
        return new TypeValidationError(path, expectedType, actualType);
    }
    static arrayOperation(path, operation, reason, originalError) {
        return new ArrayOperationError(path, operation, reason, originalError);
    }
    static proxyOperation(path, operation, originalError) {
        return new ProxyOperationError(path, operation, originalError);
    }
    static computeOperation(path, reason, originalError) {
        return new ComputeOperationError(path, reason, originalError);
    }
}
// Type guard for store errors
function isStoreError(error) {
    return error instanceof BaseStoreError;
}
// Helper to create success result
function createSuccessResult(data) {
    return { success: true, data, error: null };
}
// Helper to create error result
function createErrorResult(error) {
    return { success: false, data: null, error };
}
// Safe operation wrapper
function safeOperation(operation, errorFactory) {
    try {
        const result = operation();
        return createSuccessResult(result);
    }
    catch (error) {
        const storeError = errorFactory(error instanceof Error ? error : new Error(String(error)));
        return createErrorResult(storeError);
    }
}
// Error severity levels
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical";
})(ErrorSeverity || (ErrorSeverity = {}));
// Enhanced error base class
class EnhancedStoreError extends BaseStoreError {
    severity;
    context;
    constructor(type, message, severity, path, originalError, context) {
        super(type, message, path, originalError);
        this.severity = severity;
        this.context = context;
    }
}

// src/app/store/types/advanced-types.ts
// Expose a shared check for numeric path segment to reduce duplicate regex usage
function isNumericSegment(seg) {
    return !!seg && /^\d+$/.test(seg);
}
// Create branded path
const createStorePath = (path) => path;

let devEnabled = false;
function setLoggerActive(active) {
    devEnabled = active;
}
function log(method, args) {
    if (!devEnabled)
        return;
    console[method](...args);
}
const logger = {
    debug: (...args) => log('debug', args),
    info: (...args) => log('info', args),
    warn: (...args) => log('warn', args)
};

const FORBIDDEN_PATH_SEGMENTS$1 = new Set(['__proto__', 'prototype', 'constructor']);
function isForbiddenPathSegment(segment) {
    return segment !== undefined && segment !== null && FORBIDDEN_PATH_SEGMENTS$1.has(String(segment));
}
function hasForbiddenPathSegment(segments) {
    return segments.some((segment) => FORBIDDEN_PATH_SEGMENTS$1.has(String(segment)));
}

const BRACKET_SEGMENT_RE = /\[(.*?)\]/g;
const BASIC_PATH_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z0-9_$]+|\[\d+\])*$/;
const NORMALIZED_PATH_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z0-9_$]+)*$/;
const NUMERIC_SEGMENT_RE = /^\d+$/;
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
function isTraversable(value) {
    return value != null && (typeof value === 'object' || typeof value === 'function');
}
function normalizePathCore(path) {
    if (!path)
        return '';
    return path.indexOf('[') === -1 ? path : path.replace(BRACKET_SEGMENT_RE, '.$1');
}
function splitPathCore(path, options = {}) {
    if (!path)
        return [];
    const normalized = options.normalize === false ? path : normalizePathCore(path);
    const parts = normalized ? normalized.split('.') : [];
    return options.filterEmpty ? parts.filter(Boolean) : parts;
}
function isNumericSegmentCore(segment) {
    return !!segment && NUMERIC_SEGMENT_RE.test(segment);
}
function isForbiddenPathSegmentCore(segment) {
    return segment !== undefined && segment !== null && FORBIDDEN_PATH_SEGMENTS.has(String(segment));
}
function hasForbiddenPathSegmentCore(segments) {
    for (const segment of segments) {
        if (isForbiddenPathSegmentCore(segment))
            return true;
    }
    return false;
}
function isValidNormalizedPathCore(normalized) {
    return typeof normalized === 'string' &&
        normalized.length > 0 &&
        NORMALIZED_PATH_RE.test(normalized) &&
        !hasForbiddenPathSegmentCore(splitPathCore(normalized, { normalize: false }));
}
function isValidPathCore(path) {
    if (!path || typeof path !== 'string' || path.trim().length === 0)
        return false;
    try {
        return isValidNormalizedPathCore(normalizePathCore(path));
    }
    catch {
        return BASIC_PATH_RE.test(path);
    }
}
function assertSafePathSegmentsCore(segments, path) {
    if (hasForbiddenPathSegmentCore(segments)) {
        throw new Error(`Unsafe path segment in '${path}'`);
    }
}
function getBySegmentsCore(obj, segments, options = {}) {
    if (options.guardForbidden && hasForbiddenPathSegmentCore(segments))
        return undefined;
    let current = obj;
    for (const segment of segments) {
        if (current == null)
            return undefined;
        current = current[segment];
    }
    return current;
}
function getByPathCore(obj, path, options = {}) {
    if (!obj)
        return undefined;
    if (!path)
        return options.rootReturnsObject ? obj : undefined;
    return getBySegmentsCore(obj, splitPathCore(path, { filterEmpty: options.filterEmpty }), { guardForbidden: options.guardForbidden });
}
function setByPathCore(obj, path, value, options = {}) {
    const segments = splitPathCore(path, { filterEmpty: true });
    if (segments.length === 0)
        return;
    if (options.guardForbidden !== false)
        assertSafePathSegmentsCore(segments, path);
    let current = obj;
    const lastIndex = segments.length - 1;
    for (let i = 0; i < lastIndex; i++) {
        const segment = segments[i];
        const nextSegment = segments[i + 1];
        const shouldCreateArray = options.createArrays !== false && isNumericSegmentCore(nextSegment);
        const currentValue = current[segment];
        if (!isTraversable(currentValue)) {
            current[segment] = shouldCreateArray ? [] : {};
        }
        else if (shouldCreateArray && !Array.isArray(currentValue)) {
            current[segment] = [];
        }
        current = current[segment];
    }
    const last = segments[lastIndex];
    if (Array.isArray(current) && isNumericSegmentCore(last)) {
        current[Number(last)] = value;
    }
    else {
        current[last] = value;
    }
}
function pathExistsCore(obj, path, options = {}) {
    if (!obj || typeof obj !== 'object' || !path)
        return false;
    const segments = splitPathCore(path);
    if (options.guardForbidden !== false && hasForbiddenPathSegmentCore(segments))
        return false;
    let current = obj;
    for (const segment of segments) {
        if (current == null || typeof current !== 'object')
            return false;
        if (Array.isArray(current) && isNumericSegmentCore(segment)) {
            const index = Number(segment);
            if (!Number.isInteger(index) || index < 0 || index >= current.length)
                return false;
            current = current[index];
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(current, segment))
            return false;
        current = current[segment];
    }
    return true;
}
function getParentPathNormalizedCore(normalized) {
    if (!isValidNormalizedPathCore(normalized))
        return null;
    const index = normalized.lastIndexOf('.');
    return index === -1 ? null : normalized.slice(0, index);
}
function getParentPathCore(path) {
    if (!isValidPathCore(path))
        return null;
    return getParentPathNormalizedCore(normalizePathCore(path));
}
function getPathKeyCore(path) {
    if (!isValidPathCore(path))
        return null;
    const normalized = normalizePathCore(path);
    const index = normalized.lastIndexOf('.');
    return index === -1 ? normalized : normalized.slice(index + 1);
}
function nearestNumericContainerPathCore(path) {
    if (!path)
        return null;
    const normalized = normalizePathCore(path);
    if (!isValidNormalizedPathCore(normalized))
        return null;
    const parts = splitPathCore(normalized, { normalize: false }).filter(Boolean);
    const index = parts.findIndex((segment) => isNumericSegmentCore(segment));
    return index > 0 ? parts.slice(0, index).join('.') : null;
}
function directNumericParentPathCore(path) {
    if (!path)
        return null;
    const normalized = normalizePathCore(path);
    if (!isValidNormalizedPathCore(normalized))
        return null;
    const parts = splitPathCore(normalized, { normalize: false }).filter(Boolean);
    const last = parts[parts.length - 1];
    return isNumericSegmentCore(last) && parts.length > 1 ? parts.slice(0, -1).join('.') : null;
}
function resolveVersionPathCore(normalized, options) {
    if (options.dependencyMode === 'container') {
        const parent = getParentPathNormalizedCore(normalized);
        const base = parent ?? normalized;
        return options.bumpNumericParent ? nearestNumericContainerPathCore(base) ?? base : base;
    }
    return options.bumpNumericParent ? nearestNumericContainerPathCore(normalized) ?? normalized : normalized;
}
function enumerateAncestorPathsCore(path, options = {}) {
    if (!path || typeof path !== 'string')
        return [];
    const normalized = normalizePathCore(path);
    if (!isValidNormalizedPathCore(normalized))
        return [];
    const parts = splitPathCore(normalized, { normalize: false }).filter(Boolean);
    const out = [];
    for (let i = parts.length; i >= 1; i--) {
        out.push(parts.slice(0, i).join('.'));
    }
    if (options.includeNumericParent) {
        const parentPath = directNumericParentPathCore(normalized);
        if (parentPath && !out.includes(parentPath))
            out.push(parentPath);
    }
    return out;
}
function resolveParentAndKeyCore(obj, path) {
    const segments = splitPathCore(path, { filterEmpty: true });
    if (segments.length === 0)
        return { parent: obj, key: null, segments };
    const key = segments[segments.length - 1];
    let parent = obj;
    for (let i = 0; i < segments.length - 1; i++) {
        if (!isTraversable(parent))
            return { parent: undefined, key, segments };
        parent = parent[segments[i]];
    }
    return { parent, key, segments };
}
function getParentSegmentsCore(segments) {
    return !segments || segments.length <= 1 ? [] : segments.slice(0, -1);
}
function ensurePathInCore(target, segments) {
    let current = target;
    for (let i = 0; i < segments.length; i++) {
        if (!isTraversable(current))
            return target;
        const segment = segments[i];
        const nextSegment = segments[i + 1];
        if (!isTraversable(current[segment])) {
            current[segment] = isNumericSegmentCore(nextSegment) ? [] : {};
        }
        current = current[segment];
    }
    return current;
}
function cloneJsonCore(value) {
    if (value == null || typeof value !== 'object')
        return value;
    try {
        return structuredClone(value);
    }
    catch {
        try {
            return JSON.parse(JSON.stringify(value));
        }
        catch {
            return value;
        }
    }
}

class PathUtils {
    // Small FIFO caches to avoid repeated regex + split work in hot paths.
    static CACHE_MAX = 5000;
    static normalizedCache = new Map();
    static segmentsCache = new Map();
    static validCache = new Map();
    static versionPathCache = new Map();
    static cacheMetrics = {
        normalized: { hits: 0, misses: 0, writes: 0, evictions: 0 },
        segments: { hits: 0, misses: 0, writes: 0, evictions: 0 },
        valid: { hits: 0, misses: 0, writes: 0, evictions: 0 },
        versionPaths: { hits: 0, misses: 0, writes: 0, evictions: 0 },
    };
    static recordCacheHit(cacheName) {
        PathUtils.cacheMetrics[cacheName].hits++;
    }
    static recordCacheMiss(cacheName) {
        PathUtils.cacheMetrics[cacheName].misses++;
    }
    static cacheSet(cacheName, map, key, value, limit = PathUtils.CACHE_MAX) {
        const existed = map.has(key);
        map.set(key, value);
        if (!existed)
            PathUtils.cacheMetrics[cacheName].writes++;
        if (map.size > limit) {
            const first = map.keys().next().value;
            if (first !== undefined) {
                map.delete(first);
                PathUtils.cacheMetrics[cacheName].evictions++;
            }
        }
    }
    static snapshotCacheStats(cacheName, map, limit = PathUtils.CACHE_MAX) {
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
    static getByPath(obj, path) {
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
            return getBySegmentsCore(obj, segments);
        }
        catch (error) {
            // Don't throw for read operations, just return undefined
            logger.warn(`Failed to access path "${path}":`, error);
            return undefined;
        }
    }
    /**
     * Internal helper: apply a selector to an object with type inference
     */
    static selectValue(obj, selector) {
        return selector(obj);
    }
    /**
     * Safe version of getByPath that returns a result object instead of throwing
     */
    static safeGetByPath(obj, path) {
        return safeOperation(() => PathUtils.getByPath(obj, path), (error) => StoreErrorFactory.pathAccess(path, 'safe_get', error));
    }
    /**
     * Type-safe path value setter with validation and error handling
     */
    static setByPath(obj, path, value) {
        if (!obj || typeof obj !== 'object') {
            throw StoreErrorFactory.typeValidation(path, 'object', typeof obj);
        }
        if (!PathUtils.isValidPath(path)) {
            throw StoreErrorFactory.pathValidation(path, 'Invalid path format');
        }
        try {
            const normalizedPath = PathUtils.normalizePath(path);
            setByPathCore(obj, normalizedPath, value);
        }
        catch (error) {
            throw StoreErrorFactory.pathAccess(path, 'set', error);
        }
    }
    /**
     * Safe version of setByPath that returns a result object instead of throwing
     */
    static safeSetByPath(obj, path, value) {
        return safeOperation(() => PathUtils.setByPath(obj, path, value), (error) => StoreErrorFactory.pathAccess(path, 'safe_set', error));
    }
    /**
     * Helper to normalize any path expression to dot notation
     * Converts bracket notation (e.g., users[0].name) to dot notation (users.0.name)
     */
    static normalizePath(path) {
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
    static isValidPath(path) {
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
    static isValidNormalizedPath(normalized) {
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
    static splitNormalizedPath(normalized) {
        if (!normalized)
            return [];
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
    static splitPathExpression(path) {
        if (!path)
            return [];
        // jsnq data-engine is the SSOT for path-expression parsing; its bounded
        // plan cache backs this API, so parsing behaves exactly like inside jsnq.
        return createJsonPathPlan(path).segments;
    }
    static setPathExpressionCacheLimit(limit) {
        setJsonPlanCacheLimit(limit);
    }
    /**
     * Diagnostic cache counters for tests, benchmarks, and perf lab UI.
     * These counters are process-wide because the caches are static.
     */
    static getCacheStats() {
        const normalized = PathUtils.snapshotCacheStats('normalized', PathUtils.normalizedCache);
        const segments = PathUtils.snapshotCacheStats('segments', PathUtils.segmentsCache);
        const planStats = getJsonPlanCacheStats();
        const expressions = {
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
    static getCacheLimits() {
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
    static clearCaches() {
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
    static createPath(path) {
        if (!PathUtils.isValidPath(path)) {
            throw StoreErrorFactory.pathValidation(path, 'Invalid path format');
        }
        return createStorePath(path);
    }
    /**
     * Checks if a path exists in an object (distinguishes missing key from undefined value).
     */
    static pathExists(obj, path) {
        try {
            return pathExistsCore(obj, path);
        }
        catch {
            return false;
        }
    }
    /**
     * Gets the parent path of a given path
     */
    static getParentPath(path) {
        if (!PathUtils.isValidPath(path)) {
            return null;
        }
        const normalized = PathUtils.normalizePath(path);
        return PathUtils.getParentPathNormalized(normalized);
    }
    static getParentPathNormalized(normalized) {
        if (!PathUtils.isValidNormalizedPath(normalized)) {
            return null;
        }
        return getParentPathNormalizedCore(normalized);
    }
    /**
     * Gets the last segment (key) of a path
     */
    static getPathKey(path) {
        if (!PathUtils.isValidPath(path)) {
            return null;
        }
        return getPathKeyCore(path);
    }
    /**
     * Joins path segments safely
     */
    static joinPaths(...segments) {
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
    static isNumericSegment(segment) {
        return isNumericSegmentCore(segment);
    }
    static nearestNumericContainerPath(path) {
        return nearestNumericContainerPathCore(path);
    }
    static directNumericParentPath(path) {
        return directNumericParentPathCore(path);
    }
    static resolveVersionPath(normalized, options) {
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
    static enumerateAncestors(path, options = {}) {
        return enumerateAncestorPathsCore(path, options);
    }
    static isBranchValue(value) {
        return value !== null && typeof value === 'object';
    }
    /**
     * Type guard to check if value is a valid store data object
     */
    static isStoreData(value) {
        return value !== null &&
            value !== undefined &&
            typeof value === 'object' &&
            !Array.isArray(value);
    }
    /**
     * Gets all possible paths in an object (for development/debugging)
     */
    static getAllPaths(obj, maxDepth = 10) {
        const paths = [];
        function traverse(current, currentPath, depth) {
            if (depth >= maxDepth || current === null || current === undefined) {
                return;
            }
            if (typeof current === 'object') {
                Object.keys(current).forEach(key => {
                    const newPath = currentPath ? `${currentPath}.${key}` : key;
                    paths.push(newPath);
                    const value = current[key];
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

/**
 * Single orchestrator for array mutations with automatic:
 * - proxy cache invalidation
 * - version bumping
 * - behavior update propagation
 * - removed tail cleanup
 *
 * TypedArrayOperations owns the actual mutation semantics and proxy array helpers
 * delegate into this path via storeInstance.setArrayMethod().
 */
class ArrayMutationOrchestrator {
    wakeUpVersionPath;
    wakeUpArrayMutation;
    clearProxyCacheForPath;
    cleanupBehaviorStore;
    cleanupComputedStore;
    cleanupVersionStore;
    deleteIndexedProxyCacheRange;
    hasIndexedProxyCacheFrom;
    hasIndexedDerivedNodeFrom;
    mutationHandlers = {
        push: (arrayRef, payload) => this.applyPush(arrayRef, payload),
        unshift: (arrayRef, payload) => this.applyUnshift(arrayRef, payload),
        pop: (arrayRef) => this.applyPop(arrayRef),
        shift: (arrayRef) => this.applyShift(arrayRef),
        sort: (arrayRef, payload) => this.applySort(arrayRef, payload),
        reverse: (arrayRef) => this.applyReverse(arrayRef),
        splice: (arrayRef, payload) => this.applySplice(arrayRef, payload)
    };
    invalidationStartHandlers = {
        push: () => null,
        pop: (_payload, array) => array.length - 1,
        shift: () => 0,
        reverse: () => 0,
        sort: () => 0,
        unshift: () => 0,
        splice: (payload, array) => this.computeSpliceInvalidationStart(payload, array.length)
    };
    constructor(wakeUpVersionPath, wakeUpArrayMutation, clearProxyCacheForPath, cleanupBehaviorStore, cleanupComputedStore, cleanupVersionStore, deleteIndexedProxyCacheRange, hasIndexedProxyCacheFrom, hasIndexedDerivedNodeFrom) {
        this.wakeUpVersionPath = wakeUpVersionPath;
        this.wakeUpArrayMutation = wakeUpArrayMutation;
        this.clearProxyCacheForPath = clearProxyCacheForPath;
        this.cleanupBehaviorStore = cleanupBehaviorStore;
        this.cleanupComputedStore = cleanupComputedStore;
        this.cleanupVersionStore = cleanupVersionStore;
        this.deleteIndexedProxyCacheRange = deleteIndexedProxyCacheRange;
        this.hasIndexedProxyCacheFrom = hasIndexedProxyCacheFrom;
        this.hasIndexedDerivedNodeFrom = hasIndexedDerivedNodeFrom;
    }
    mutate(arrayPath, arrayRef, method, payload) {
        const oldLength = arrayRef.length;
        const proxyInvalidationStart = this.computeInvalidationStart(method, payload, arrayRef);
        const result = this.mutationHandlers[method](arrayRef, payload);
        const newLength = arrayRef.length;
        this.finalizeArrayChange(arrayPath, arrayRef, oldLength, newLength, proxyInvalidationStart);
        return { oldLength, newLength, proxyInvalidationStart, result };
    }
    updateItem(arrayPath, arrayRef, index, newValue) {
        if (index < 0 || index >= arrayRef.length) {
            throw new Error(`Index ${index} out of bounds for array at ${arrayPath}`);
        }
        arrayRef[index] = newValue;
        const elementPath = `${arrayPath}.${index}`;
        this.wakeUpArrayMutation(elementPath, newValue);
    }
    deleteByIndex(arrayPath, arrayRef, index) {
        const oldLength = arrayRef.length;
        if (index < 0 || index >= arrayRef.length) {
            this.wakeUpVersionPath(arrayPath);
            return;
        }
        arrayRef.splice(index, 1);
        const newLength = arrayRef.length;
        this.finalizeArrayChange(arrayPath, arrayRef, oldLength, newLength, index);
    }
    finalizeArrayChange(arrayPath, value, oldLength, newLength, proxyInvalidationStart) {
        this.wakeUpArrayMutation(arrayPath, value, () => {
            if (proxyInvalidationStart !== null && this.shouldClearIndexedProxyCache(arrayPath, proxyInvalidationStart)) {
                this.invalidateProxyRange(arrayPath, proxyInvalidationStart, oldLength);
            }
            this.cleanupRemovedTailIndices(arrayPath, oldLength, newLength);
        });
    }
    computeInvalidationStart(method, payload, array) {
        if (!array.length)
            return null;
        return this.invalidationStartHandlers[method](payload, array);
    }
    applyPush(arrayRef, payload) {
        const items = payload;
        return items.length === 1 ? arrayRef.push(items[0]) : arrayRef.push(...items);
    }
    applyUnshift(arrayRef, payload) {
        const items = payload;
        return items.length === 1 ? arrayRef.unshift(items[0]) : arrayRef.unshift(...items);
    }
    applyPop(arrayRef) {
        return arrayRef.pop();
    }
    applyShift(arrayRef) {
        return arrayRef.shift();
    }
    applySort(arrayRef, payload) {
        return arrayRef.sort(payload);
    }
    applyReverse(arrayRef) {
        return arrayRef.reverse();
    }
    applySplice(arrayRef, payload) {
        const op = payload;
        return op.deleteCount === undefined
            ? arrayRef.splice(op.start)
            : arrayRef.splice(op.start, op.deleteCount, ...op.items);
    }
    computeSpliceInvalidationStart(payload, length) {
        const op = payload;
        const start = this.normalizeSpliceStart(op.start, length);
        const deleteCount = op.deleteCount ?? Math.max(0, length - start);
        if (deleteCount <= 0 && op.items.length <= 0)
            return null;
        if (start >= length && deleteCount <= 0)
            return null;
        return start;
    }
    normalizeSpliceStart(start, arrayLength) {
        if (start < 0)
            return Math.max(arrayLength + start, 0);
        return Math.min(start, arrayLength);
    }
    invalidateProxyRange(arrayPath, startIndex, oldLength) {
        if (startIndex < 0 || startIndex >= oldLength)
            return;
        if (this.deleteIndexedProxyCacheRange) {
            this.deleteIndexedProxyCacheRange(arrayPath, startIndex, oldLength);
            return;
        }
        for (let i = startIndex; i < oldLength; i++) {
            this.clearProxyCacheForPath(`${arrayPath}.${i}`);
        }
    }
    cleanupRemovedTailIndices(arrayPath, oldLength, newLength) {
        if (oldLength <= newLength)
            return;
        const shouldClearProxyCache = this.shouldClearIndexedProxyCache(arrayPath, newLength);
        const shouldCleanupDerived = this.shouldCleanupIndexedDerivedNodes(arrayPath, newLength);
        if (!shouldClearProxyCache && !shouldCleanupDerived)
            return;
        if (shouldClearProxyCache)
            this.invalidateProxyRange(arrayPath, newLength, oldLength);
        for (let index = newLength; index < oldLength; index++) {
            const elementPath = `${arrayPath}.${index}`;
            if (shouldCleanupDerived) {
                queueMicrotask(() => {
                    this.cleanupBehaviorStore?.(elementPath);
                    this.cleanupComputedStore?.(elementPath);
                    this.cleanupVersionStore?.(elementPath);
                });
            }
        }
    }
    shouldClearIndexedProxyCache(arrayPath, startIndex) {
        return this.hasIndexedProxyCacheFrom ? this.hasIndexedProxyCacheFrom(arrayPath, startIndex) : true;
    }
    shouldCleanupIndexedDerivedNodes(arrayPath, startIndex) {
        return this.hasIndexedDerivedNodeFrom ? this.hasIndexedDerivedNodeFrom(arrayPath, startIndex) : true;
    }
}

function asPredicate(input) {
    return typeof input === 'function'
        ? input
        : (item) => item === input;
}
class ArrayQueryExecutor {
    static handlers = {
        find: (context) => ArrayQueryExecutor.find(context),
        findIndex: (context) => ArrayQueryExecutor.findIndex(context),
        filter: (context) => ArrayQueryExecutor.filter(context),
        map: (context) => ArrayQueryExecutor.map(context),
        reduce: (context) => ArrayQueryExecutor.reduce(context),
        some: (context) => ArrayQueryExecutor.some(context),
        every: (context) => ArrayQueryExecutor.every(context),
        includes: (context) => ArrayQueryExecutor.includes(context),
        indexOf: (context) => ArrayQueryExecutor.indexOf(context),
        length: (context) => ArrayQueryExecutor.lengthQuery(context)
    };
    static execute(arrayRef, method, input, args, options) {
        return ArrayQueryExecutor.handlers[method]({ arrayRef, input, args, options });
    }
    static find({ arrayRef, input, options }) {
        const result = arrayRef.find(asPredicate(input));
        if (options.cloneFoundObject && result && typeof result === 'object') {
            return { ...result };
        }
        return result;
    }
    static findIndex({ arrayRef, input }) {
        return arrayRef.findIndex(asPredicate(input));
    }
    static filter({ arrayRef, input }) {
        return arrayRef.filter(input);
    }
    static map({ arrayRef, input }) {
        return arrayRef.map(input);
    }
    static reduce({ arrayRef, input, args }) {
        return args.length > 0
            ? arrayRef.reduce(input, args[0])
            : arrayRef.reduce(input);
    }
    static some({ arrayRef, input }) {
        return arrayRef.some(input);
    }
    static every({ arrayRef, input }) {
        return arrayRef.every(input);
    }
    static includes({ arrayRef, input }) {
        return arrayRef.includes(input);
    }
    static indexOf({ arrayRef, input }) {
        return arrayRef.indexOf(input);
    }
    static lengthQuery({ arrayRef }) {
        return arrayRef.length;
    }
}
function executeArrayQuery(arrayRef, method, input, args = [], options = {}) {
    return ArrayQueryExecutor.execute(arrayRef, method, input, args, options);
}

class TypedArrayOperations {
    signalStore;
    storeName;
    path;
    orchestrator;
    orchestratorStore;
    constructor(signalStore, storeName, path) {
        this.signalStore = signalStore;
        this.storeName = storeName;
        this.path = path;
    }
    mutationInputNormalizers = {
        splice: (value) => this.normalizeSpliceInput(value),
        push: (value, args) => this.normalizeVariadicInput('push', value, args),
        unshift: (value, args) => this.normalizeVariadicInput('unshift', value, args),
        pop: (value, args) => this.normalizeSinglePayloadInput('pop', value, args),
        shift: (value, args) => this.normalizeSinglePayloadInput('shift', value, args),
        sort: (value, args) => this.normalizeSinglePayloadInput('sort', value, args),
        reverse: (value, args) => this.normalizeSinglePayloadInput('reverse', value, args)
    };
    emptyArrayQueryFallbacks = {
        length: () => 0,
        filter: () => [],
        map: () => [],
        find: () => undefined,
        findIndex: () => undefined,
        reduce: () => undefined,
        some: () => undefined,
        every: () => undefined,
        includes: () => undefined,
        indexOf: () => undefined
    };
    withArray(strict, fn) {
        if (!PathUtils.isValidPath(this.path)) {
            throw StoreErrorFactory.pathValidation(this.path, 'Invalid path format for array operation');
        }
        const store = this.signalStore.getStore(this.storeName);
        const ref = PathUtils.getByPath(store.returnStore(), this.path);
        if (ref !== undefined && !Array.isArray(ref)) {
            throw StoreErrorFactory.typeValidation(this.path, 'array', typeof ref);
        }
        const array = Array.isArray(ref) ? ref : undefined;
        if (strict && !array) {
            throw new Error(`Path ${String(this.path)} does not point to an array`);
        }
        return fn(store, array, ref);
    }
    asPredicate(predicateOrValue) {
        return typeof predicateOrValue === 'function'
            ? predicateOrValue
            : (item) => item === predicateOrValue;
    }
    isSpliceOperation(value) {
        return !!value && typeof value === 'object' && 'start' in value && 'deleteCount' in value && 'items' in value;
    }
    getOrchestrator(store) {
        if (this.orchestrator && this.orchestratorStore === store) {
            return this.orchestrator;
        }
        const getter = store.createServiceGetter;
        this.orchestrator = new ArrayMutationOrchestrator((p) => store.wakeUpVersionPath(p), (p, value, afterVersion) => store.wakeUpArrayMutation(p, value, afterVersion), (p) => getter.clearProxyCacheForPath?.(p), (p) => getter.cleanupBehaviorStore?.(p), (p) => getter.cleanupComputedStore?.(p), (p) => getter.cleanupVersionStore?.(p), (p, startIndex, endIndex) => getter.deleteIndexedProxyCacheRange?.(p, startIndex, endIndex), (p, startIndex) => getter.hasIndexedProxyCacheFrom?.(p, startIndex) ?? true, (p, startIndex) => getter.hasIndexedDerivedNodeFrom?.(p, startIndex) ?? true);
        this.orchestratorStore = store;
        return this.orchestrator;
    }
    emitDev(method, args, oldValue, newValue) {
        if (!this.signalStore.devActive)
            return;
        this.signalStore.emitDevAction(this.storeName, {
            type: 'ARRAY_OPERATION',
            payload: {
                path: String(this.path),
                method: String(method),
                args,
                oldValue: oldValue ?? [],
                newValue: newValue ?? []
            }
        });
    }
    normalizeMutationInput(a, method, args = []) {
        if (typeof a === 'string' && (a === 'pop' || a === 'shift')) {
            return this.mutationInputNormalizers[a](undefined, args);
        }
        if (!method) {
            throw new Error('Missing array mutation method');
        }
        return this.mutationInputNormalizers[method](a, args);
    }
    normalizeSpliceInput(value) {
        if (!this.isSpliceOperation(value)) {
            throw new Error('Invalid splice operation payload');
        }
        const op = {
            start: value.start,
            deleteCount: value.deleteCount,
            items: Array.isArray(value.items) ? value.items : []
        };
        return { method: 'splice', payload: op, devArgs: [op.start, op.deleteCount, ...op.items] };
    }
    normalizeVariadicInput(method, value, args) {
        const items = [value, ...args];
        return { method, payload: items, devArgs: items };
    }
    normalizeSinglePayloadInput(method, value, args) {
        return { method, payload: value, devArgs: [value, ...args] };
    }
    executeMutation(store, array, oldValue, info) {
        const before = this.signalStore.devActive ? structuredClone(array) : oldValue;
        const mutation = this.getOrchestrator(store).mutate(this.path, array, info.method, info.payload);
        this.emitDev(info.method, info.devArgs, before, array);
        return mutation.result;
    }
    findInArray(predicate) { return this.queryArray(predicate, 'find'); }
    findIndexInArray(predicate) { return this.queryArray(predicate, 'findIndex'); }
    filterArray(predicate) { return this.queryArray(predicate, 'filter'); }
    mapArray(callback) { return this.queryArray(callback, 'map'); }
    reduceArray(callback, initialValue) { return this.queryArray(callback, 'reduce', initialValue); }
    someArray(predicate) { return this.queryArray(predicate, 'some'); }
    everyArray(predicate) { return this.queryArray(predicate, 'every'); }
    includesInArray(searchElement) { return this.queryArray(searchElement, 'includes'); }
    indexOfInArray(searchElement) { return this.queryArray(searchElement, 'indexOf'); }
    lengthOfArray() { return this.queryArray(undefined, 'length'); }
    updateArrayItem(index, newValue) {
        try {
            this.withArray(true, (store, array) => {
                this.getOrchestrator(store).updateItem(this.path, array, index, newValue);
            });
        }
        catch (error) {
            throw StoreErrorFactory.arrayOperation(this.path, 'updateItem', 'Update array item operation failed', error);
        }
    }
    updateArrayItemByFind(predicate, newValue) {
        try {
            this.withArray(true, (store, array) => {
                const target = array;
                const predicateFn = this.asPredicate(predicate);
                const index = target.findIndex(predicateFn);
                if (index !== -1) {
                    this.getOrchestrator(store).updateItem(this.path, array, index, newValue);
                    return;
                }
                store.wakeUpVersionPath(this.path);
            });
        }
        catch (error) {
            throw StoreErrorFactory.arrayOperation(this.path, 'updateItemByFind', 'Update array item by find operation failed', error);
        }
    }
    setArrayMethod(a, method, ...args) {
        let info;
        try {
            info = this.normalizeMutationInput(a, method, args);
            return this.withArray(true, (store, array, oldValue) => {
                return this.executeMutation(store, array, oldValue, info);
            });
        }
        catch (error) {
            const methodName = info?.method ?? (typeof a === 'string' ? a : method ?? 'unknown');
            throw StoreErrorFactory.arrayOperation(this.path, methodName, `${String(methodName)} operation failed`, error);
        }
    }
    setArrayMethodOnRef(array, val, method, ...args) {
        let info;
        try {
            if (!PathUtils.isValidPath(this.path)) {
                throw StoreErrorFactory.pathValidation(this.path, 'Invalid path format for array operation');
            }
            info = this.normalizeMutationInput(val, method, args);
            const store = this.signalStore.getStore(this.storeName);
            return this.executeMutation(store, array, array, info);
        }
        catch (error) {
            const methodName = info?.method ?? method ?? 'unknown';
            throw StoreErrorFactory.arrayOperation(this.path, methodName, `${String(methodName)} operation failed`, error);
        }
    }
    queryArray(val, method, ...extra) {
        try {
            return this.withArray(false, (_, array) => {
                if (!Array.isArray(array)) {
                    return this.emptyArrayQueryFallbacks[method]();
                }
                return executeArrayQuery(array, method, val, extra);
            });
        }
        catch (error) {
            throw StoreErrorFactory.arrayOperation(this.path, method, 'Query array operation failed', error);
        }
    }
    deleteFromArray(predicate) {
        try {
            return this.withArray(true, (store, array, oldValue) => {
                const target = array;
                const oldLength = target.length;
                const predicateFn = this.asPredicate(predicate);
                const indexes = [];
                const removed = [];
                target.forEach((item, index, arr) => {
                    if (predicateFn(item, index, arr)) {
                        indexes.push(index);
                        removed.push(item);
                    }
                });
                const filtered = target.filter((item, index, arr) => !predicateFn(item, index, arr));
                target.length = 0;
                target.push(...filtered);
                const newLength = target.length;
                const orchestrator = this.getOrchestrator(store);
                const newValue = store.readStore(this.path);
                orchestrator.finalizeArrayChange(this.path, newValue, oldLength, newLength, indexes.length ? Math.min(...indexes) : null);
                return {
                    method: 'filter',
                    path: this.path,
                    args: [predicate],
                    oldValue,
                    newValue,
                    removedElements: removed,
                    indexes,
                    item: removed
                };
            });
        }
        catch (error) {
            throw StoreErrorFactory.arrayOperation(this.path, 'deleteFromArray', 'Delete from array operation failed', error);
        }
    }
    deleteByIndex(index) {
        try {
            return this.withArray(true, (store, array, oldValue) => {
                const target = array;
                const oldLength = target.length;
                if (index < 0 || index >= target.length) {
                    store.wakeUpVersionPath(this.path);
                    return {
                        method: 'splice',
                        path: this.path,
                        args: [{ start: index, deleteCount: 0, items: [] }],
                        oldValue,
                        newValue: oldValue,
                        removedElements: [],
                        indexes: [],
                        item: undefined
                    };
                }
                const [removed] = target.splice(index, 1);
                const orch = this.getOrchestrator(store);
                const newLength = target.length;
                orch.finalizeArrayChange(this.path, target, oldLength, newLength, index);
                const newValue = store.readStore(this.path);
                const removedItems = removed !== undefined ? [removed] : [];
                return {
                    method: 'splice',
                    path: this.path,
                    args: [{ start: index, deleteCount: 1, items: [] }],
                    oldValue,
                    newValue,
                    removedElements: removedItems,
                    indexes: removedItems.length ? [index] : [],
                    item: removed
                };
            });
        }
        catch (error) {
            throw StoreErrorFactory.arrayOperation(this.path, 'deleteByIndex', 'Delete by index operation failed', error);
        }
    }
}
class ArrayChain {
    ops;
    constructor(ops) {
        this.ops = ops;
    }
    push(value) { this.ops.setArrayMethod(value, 'push'); return this; }
    unshift(value) { this.ops.setArrayMethod(value, 'unshift'); return this; }
    pop() { this.ops.setArrayMethod('pop'); return this; }
    shift() { this.ops.setArrayMethod('shift'); return this; }
    sort(compareFn) { this.ops.setArrayMethod(compareFn, 'sort'); return this; }
    splice(start, deleteCount = 0, ...items) { this.ops.setArrayMethod({ start, deleteCount, items }, 'splice'); return this; }
    update(index, newValue) { this.ops.updateArrayItem(index, newValue); return this; }
    updateByFind(predicateOrValue, newValue) { this.ops.updateArrayItemByFind(predicateOrValue, newValue); return this; }
    delete(predicateOrValue) { this.ops.deleteFromArray(predicateOrValue); return this; }
    deleteByIndex(index) { this.ops.deleteByIndex(index); return this; }
    find(predicateOrValue) { return this.ops.findInArray(predicateOrValue); }
    findIndex(predicateOrValue) { return this.ops.findIndexInArray(predicateOrValue); }
    filter(predicate) { return this.ops.filterArray(predicate); }
    map(mapFn) { return this.ops.mapArray(mapFn); }
    reduce(reduceFn, initialValue) { return this.ops.reduceArray(reduceFn, initialValue); }
    some(predicate) { return this.ops.someArray(predicate); }
    every(predicate) { return this.ops.everyArray(predicate); }
    includes(value) { return this.ops.includesInArray(value); }
    indexOf(value) { return this.ops.indexOfInArray(value); }
    length() { return this.ops.lengthOfArray(); }
}

/**
 * Generic flat map store with path-based operations.
 * Normalization cache avoids repeated regex operations.
 * Prefix operations use simple linear scan (sufficient for typical store sizes).
 */
class FlatStoreMap {
    map = Object.create(null);
    normalizeCache = Object.create(null);
    cacheHits = 0;
    cacheMisses = 0;
    _cachedSize = 0;
    _sizeValid = false;
    normalize(path) {
        let normalized = this.normalizeCache[path];
        if (normalized === undefined) {
            normalized = PathUtils.normalizePath(path);
            this.normalizeCache[path] = normalized;
            this.cacheMisses++;
        }
        else {
            this.cacheHits++;
        }
        return normalized;
    }
    get(path) {
        return this.map[this.normalize(path)];
    }
    set(path, value) {
        const normalized = this.normalize(path);
        const existed = this.map[normalized] !== undefined;
        this.map[normalized] = value;
        if (!existed)
            this.invalidateSize();
    }
    has(path) {
        return this.map[this.normalize(path)] !== undefined;
    }
    exists(path, checkFn) {
        const normalized = this.normalize(path);
        const value = this.map[normalized];
        return value !== undefined && (!checkFn || checkFn(value));
    }
    delete(path) {
        const normalized = this.normalize(path);
        const existed = this.map[normalized] !== undefined;
        if (existed) {
            delete this.map[normalized];
            this.invalidateSize();
        }
        delete this.normalizeCache[path];
        return existed;
    }
    deleteByPrefix(prefix, onDelete) {
        const normalized = this.normalize(prefix);
        const prefixMatch = normalized ? normalized + '.' : '';
        const keys = Object.keys(this.map);
        let deletedCount = 0;
        for (const key of keys) {
            if (key === normalized || key.startsWith(prefixMatch)) {
                if (onDelete) {
                    try {
                        onDelete(key, this.map[key]);
                    }
                    catch (e) {
                        console.warn('FlatStoreMap onDelete error:', e);
                    }
                }
                delete this.map[key];
                deletedCount++;
            }
        }
        // Cleanup normalize cache
        const cacheKeys = Object.keys(this.normalizeCache);
        for (const cacheKey of cacheKeys) {
            const cachedNormalized = this.normalizeCache[cacheKey];
            if (cachedNormalized === normalized || cachedNormalized.startsWith(prefixMatch)) {
                delete this.normalizeCache[cacheKey];
            }
        }
        if (deletedCount > 0)
            this.invalidateSize();
        return deletedCount;
    }
    getByPrefix(prefix) {
        const normalized = this.normalize(prefix);
        const prefixMatch = normalized ? normalized + '.' : '';
        const result = [];
        for (const key of Object.keys(this.map)) {
            if (key === normalized || key.startsWith(prefixMatch)) {
                result.push(key);
            }
        }
        return result;
    }
    keys() {
        return Object.keys(this.map);
    }
    values() {
        return Object.values(this.map);
    }
    toObject() {
        return { ...this.map };
    }
    clear() {
        this.map = Object.create(null);
        this.normalizeCache = Object.create(null);
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this._sizeValid = false;
        this._cachedSize = 0;
    }
    get size() {
        if (!this._sizeValid) {
            this._cachedSize = Object.keys(this.map).length;
            this._sizeValid = true;
        }
        return this._cachedSize;
    }
    invalidateSize() {
        this._sizeValid = false;
    }
    forEach(callback) {
        Object.keys(this.map).forEach(key => {
            callback(this.map[key], key);
        });
    }
    getOrCreate(path, factory) {
        const normalized = this.normalize(path);
        let value = this.map[normalized];
        if (value === undefined) {
            value = factory(normalized);
            this.map[normalized] = value;
            this.invalidateSize();
        }
        return value;
    }
    addIfMissing(path, factory) {
        const normalized = this.normalize(path);
        if (this.map[normalized] === undefined) {
            const value = factory(normalized);
            if (value !== undefined) {
                this.map[normalized] = value;
                this.invalidateSize();
            }
        }
    }
    getCacheStats() {
        const total = this.cacheHits + this.cacheMisses;
        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: total > 0 ? this.cacheHits / total : 0,
            cacheSize: Object.keys(this.normalizeCache).length,
            prefixIndexSize: 0,
            indexActive: false,
        };
    }
    hasPrefix(prefix) {
        const normalized = this.normalize(prefix);
        const prefixMatch = normalized ? normalized + '.' : '';
        for (const key of Object.keys(this.map)) {
            if (key === normalized || key.startsWith(prefixMatch))
                return true;
        }
        return false;
    }
    countByPrefix(prefix) {
        const normalized = this.normalize(prefix);
        const prefixMatch = normalized ? normalized + '.' : '';
        let count = 0;
        for (const key of Object.keys(this.map)) {
            if (key === normalized || key.startsWith(prefixMatch))
                count++;
        }
        return count;
    }
}

/**
 * CursorManager - optimized path traversal with caching.
 * Uses FlatStoreMap for better performance than plain Record.
 */
class CursorManager {
    pathSetPlanCache = new FlatStoreMap();
    cursor = new JsonDataCursor();
    applyPathPlan(normalizedPath) {
        return this.pathSetPlanCache.getOrCreate(normalizedPath, (normalized) => createJsonPathPlan$1(normalized));
    }
    prefetch(path, node) {
        this.cursor.prefetch(path, node);
    }
    mutateNode(root, plan, normalizedPath, value) {
        const effectivePlan = plan.path === normalizedPath ? plan : createJsonPathPlan$1(normalizedPath);
        const result = this.cursor.writeWithPlan(root, effectivePlan, value);
        return result.previous;
    }
    invalidateCache(normalizedPath) {
        this.pathSetPlanCache.deleteByPrefix(normalizedPath);
    }
    invalidateForDeletion(normalizedPath) {
        this.cursor.invalidateForDeletion(normalizedPath);
    }
    /**
     * Get cache statistics for performance monitoring.
     */
    getCacheStats() {
        return {
            pathPlanCache: this.pathSetPlanCache.getCacheStats(),
            cursorActive: this.cursor.active,
        };
    }
    /**
     * Clear all caches (useful for testing or memory management).
     */
    clearCaches() {
        this.pathSetPlanCache.clear();
        this.cursor.clear();
    }
}

/**
 * Centralized path validation and normalization utilities.
 * Provides consistent error handling for path operations.
 */
class PathValidator {
    /**
     * Validates and normalizes a path in one operation.
     * @throws {PathValidationError} if path is invalid
     */
    static validateAndNormalize(path) {
        if (!PathUtils.isValidPath(path)) {
            throw StoreErrorFactory.pathValidation(path, 'Invalid path format');
        }
        return PathUtils.normalizePath(path);
    }
    /**
     * Validates path and ensures it exists in the store.
     * @throws {PathValidationError} if path is invalid
     * @throws {PathAccessError} if path doesn't exist
     */
    static ensureExists(store, path) {
        const normalized = this.validateAndNormalize(path);
        if (store.readStore(normalized) === undefined) {
            throw StoreErrorFactory.pathAccess(path, 'read', new Error('Path does not exist in store'));
        }
        return normalized;
    }
    /**
     * Safe validation - returns result object instead of throwing.
     */
    static safeValidateAndNormalize(path) {
        try {
            const normalized = this.validateAndNormalize(path);
            return { valid: true, path: normalized };
        }
        catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Check if path is valid without throwing.
     */
    static isValid(path) {
        return PathUtils.isValidPath(path);
    }
    /**
     * Normalize path without validation (use carefully).
     */
    static normalizeUnsafe(path) {
        try {
            return PathUtils.normalizePath(path);
        }
        catch {
            return path;
        }
    }
}

/**
 * Centralized DevTools emitter.
 * Eliminates duplicated DevTools emission logic across managers.
 * Unix philosophy: single responsibility – emit dev events.
 */
class DevToolsEmitter {
    devActive;
    emitAction;
    emitRead;
    lastMetricsEmit = {};
    metricsThrottleMs = 250;
    constructor(devActive, emitAction, emitRead) {
        this.devActive = devActive;
        this.emitAction = emitAction;
        this.emitRead = emitRead;
    }
    emit(storeName, action) {
        if (!this.devActive())
            return;
        const event = { ...action, storeName };
        queueMicrotask(() => this.emitAction(event));
        if (action.type !== 'PROXY_METRICS') {
            queueMicrotask(() => this.emitRead(event));
        }
    }
    emitImmediate(storeName, action) {
        if (!this.devActive())
            return;
        this.emitAction({ ...action, storeName });
    }
    emitMetrics(storeName, metrics) {
        if (!this.devActive())
            return;
        const now = Date.now();
        const last = this.lastMetricsEmit[storeName] || 0;
        if (now - last < this.metricsThrottleMs)
            return;
        this.lastMetricsEmit[storeName] = now;
        this.emit(storeName, {
            type: 'PROXY_METRICS',
            payload: {
                path: 'proxy-cache',
                ...metrics,
                cacheDump: metrics.cacheDump ?? [],
                cacheKeys: metrics.cacheKeys ?? [],
                graph: undefined,
            },
        });
    }
    setMetricsThrottle(ms) {
        this.metricsThrottleMs = Math.max(0, ms);
    }
}

/**
 * Base class for all store managers (BehaviorManager, ComputedManager, VersionManager).
 * Provides common functionality and eliminates code duplication.
 */
class BaseManager {
    core;
    storeName;
    // Cache store reference for performance (avoids repeated lookups)
    _storeRef = null;
    devToolsEmitter;
    constructor(core, storeName) {
        this.core = core;
        this.storeName = storeName;
        this.devToolsEmitter = new DevToolsEmitter(() => this.signalStore.devActive, (event) => {
            const ds = this.devService;
            if (ds)
                ds.emitAction(event);
        }, (event) => {
            const ds = this.devService;
            if (ds)
                ds.emitRead(event);
        });
    }
    /**
     * Get SignalStore instance (convenience accessor).
     */
    get signalStore() {
        return this.core.signalStore;
    }
    /**
     * Get cached reference to the store data (avoids repeated getStore() calls).
     * CRITICAL PERFORMANCE: Called frequently in computed() callbacks.
     */
    get storeRef() {
        if (!this._storeRef) {
            this._storeRef = this.signalStore.getStore(this.storeName).returnStore();
        }
        return this._storeRef;
    }
    /**
     * Get DevService instance (lazy loaded, only when devActive).
     */
    get devService() {
        return this.signalStore.devActive ? this.signalStore.getDevtoolsAdapter() : undefined;
    }
    /**
     * Check if DevTools is active.
     */
    get devActive() {
        return this.signalStore.devActive;
    }
    /**
     * Normalize path using PathUtils.
     */
    normalizePath(path) {
        return PathUtils.normalizePath(path);
    }
    /**
     * Validate and normalize path in one operation.
     * @throws {PathValidationError} if path is invalid
     */
    validateAndNormalizePath(path) {
        return PathValidator.validateAndNormalize(path);
    }
    /**
     * Check if path is valid without throwing.
     */
    isValidPath(path) {
        return PathValidator.isValid(path);
    }
    /**
     * Check if path has a value in the store.
     */
    pathHasValue(path) {
        const normalized = this.normalizePath(path);
        return this.signalStore.readStore(this.storeName, normalized) !== undefined;
    }
    /**
     * Read value from store at given path.
     */
    readStore(path) {
        const normalized = this.normalizePath(path);
        return this.signalStore.readStore(this.storeName, normalized);
    }
    /**
     * Safe operation wrapper - catches and logs errors without throwing.
     */
    safeExecute(operation, defaultValue) {
        try {
            return operation();
        }
        catch (error) {
            if (this.devActive) {
                console.warn(`[${this.constructor.name}] Operation failed:`, error);
            }
            return defaultValue;
        }
    }
    /**
     * Emit DevTools action through unified emitter.
     */
    emitDevTools(action) {
        this.devToolsEmitter.emit(this.storeName, action);
    }
}

// Shared helpers to build stable cache keys and hashed segments for array queries
function serializeForKey(v) {
    if (typeof v === 'function')
        return v.toString();
    try {
        return JSON.stringify(v);
    }
    catch {
        return String(v);
    }
}
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit
    }
    return Math.abs(hash).toString(36);
}
function buildMethodHashSegment(method, predicate, args) {
    const keySeed = serializeForKey(predicate) + (args.length ? serializeForKey(args) : '');
    return `${method}_${hashString(keySeed)}`;
}
function buildArrayQueryCacheKey(path, method, predicate, args) {
    // Stable, human-readable key for per-proxy cache
    const safe = serializeForKey(predicate);
    const rest = args.length ? serializeForKey(args) : '';
    return `${path}|${method}|${safe}|${rest}`;
}

/**
 * Manages computed signals graph for a single store instance.
 * Refactored with BaseManager and FlatStoreMap for optimal performance.
 */
class ComputedService extends BaseManager {
    computedStore = new FlatStoreMap();
    constructor(core, storeName) {
        super(core, storeName);
    }
    // --- public API used by core ---
    get(path) {
        const existing = this.computedStore.get(path);
        if (existing)
            return existing;
        this.add(path);
        return this.computedStore.get(path);
    }
    add(path) {
        if (!super.pathHasValue(path))
            return;
        if (this.computedStore.has(path))
            return;
        const normalizedPath = this.normalizePath(path);
        const pathSegments = this.core.getPathSegments(normalizedPath);
        let cachedVersionPath;
        let versionRef;
        const s = computed(() => {
            const versionPath = this.core.resolveVersionPathNormalized(normalizedPath);
            if (!versionRef || cachedVersionPath !== versionPath) {
                versionRef = this.core.getVersion(versionPath);
                cachedVersionPath = versionPath;
            }
            versionRef();
            const value = this.core.fastReadBySegments(this.storeRef, pathSegments);
            if (this.core.getCloneComputedOutputs()) {
                if (value && typeof value === 'object') {
                    return Array.isArray(value) ? [...value] : { ...value };
                }
            }
            return value;
        }, ...(ngDevMode ? [{ debugName: "s" }] : []));
        this.core.setSignalInProxyCache(normalizedPath, s);
        this.computedStore.set(normalizedPath, s);
    }
    remove(path) {
        this.computedStore.deleteByPrefix(path);
    }
    cleanup(pathPrefix) {
        if (!pathPrefix) {
            this.computedStore.clear();
        }
        else {
            this.computedStore.deleteByPrefix(pathPrefix);
        }
    }
    isExists(path) {
        return this.computedStore.has(path);
    }
    keys() {
        return this.computedStore.keys();
    }
    store() {
        return this.computedStore.toObject();
    }
    // Array query computed
    createArrayQueryComputed(path, method, predicate, ...args) {
        const normalizedPath = this.normalizePath(path);
        const baseSegments = Array.from(this.core.getPathSegments(normalizedPath));
        if (!super.pathHasValue(normalizedPath))
            return undefined;
        const keySegment = buildMethodHashSegment(method, predicate, args);
        const fullPath = [...baseSegments, '$arrayQuery', keySegment].join('.');
        const existing = this.computedStore.get(fullPath);
        if (existing)
            return existing;
        const pathSegments = this.core.getPathSegments(normalizedPath);
        let cachedVersionPath;
        let versionRef;
        const s = computed(() => {
            const versionPath = this.core.resolveVersionPathNormalized(normalizedPath);
            if (!versionRef || cachedVersionPath !== versionPath) {
                versionRef = this.core.getVersion(versionPath);
                cachedVersionPath = versionPath;
            }
            versionRef();
            const arrayRef = this.core.fastReadBySegments(this.storeRef, pathSegments);
            if (!Array.isArray(arrayRef))
                return undefined;
            try {
                return this.safeArrayQuery(arrayRef, predicate, method, ...args);
            }
            catch (e) {
                console.warn('ComputedService array query error:', e);
                return undefined;
            }
        }, ...(ngDevMode ? [{ debugName: "s" }] : []));
        this.core.setSignalInProxyCache(fullPath, s);
        this.computedStore.set(fullPath, s);
        this.emitDevTools({
            type: 'COMPUTED_STORE_UPDATE',
            payload: { storeName: this.storeName, action: 'add', path: fullPath, keys: this.keys() }
        });
        return this.computedStore.get(fullPath);
    }
    registerPipelineComputed(path, signalRef) {
        if (!signalRef)
            return;
        const normalizedPath = this.normalizePath(path);
        const existed = this.computedStore.has(normalizedPath);
        this.computedStore.set(normalizedPath, signalRef);
        this.core.setSignalInProxyCache(normalizedPath, signalRef);
        const operation = existed ? 'update' : 'add';
        this.emitDevTools({
            type: 'COMPUTED_STORE_UPDATE',
            payload: { storeName: this.storeName, action: operation, path: normalizedPath, keys: this.keys() }
        });
    }
    safeArrayQuery(arrayRef, predicate, method, ...args) {
        try {
            return executeArrayQuery(arrayRef, method, predicate, args, { cloneFoundObject: true });
        }
        catch {
            return undefined;
        }
    }
    // Auto-tracked multi-path computed
    createAutoTrackedComputed(pathKey, derive) {
        const full = this.getAutoComputedKey(pathKey);
        const existing = this.computedStore.get(full);
        if (existing)
            return existing;
        const computedSignal = !this.core.getTrackReads()
            ? computed(() => {
                const base = this.core.resolveVersionPathNormalized(PathUtils.normalizePath(pathKey));
                this.core.getVersion(base)();
                const result = derive((p) => PathUtils.getByPath(this.storeRef, PathUtils.normalizePath(p)));
                if (result && typeof result === 'object') {
                    return (Array.isArray(result) ? [...result] : { ...result });
                }
                return result;
            })
            : (() => {
                const depRefs = new Map();
                return computed(() => {
                    this.core.startCollect();
                    const get = (path) => {
                        const n = PathUtils.normalizePath(path);
                        this.core.registerRead(n);
                        return PathUtils.getByPath(this.storeRef, n);
                    };
                    const result = derive(get);
                    const collected = this.core.stopCollect() || new Set();
                    const newDeps = new Set();
                    if (collected.size > 0) {
                        for (const p of collected) {
                            const normalized = PathUtils.normalizePath(p);
                            const base = this.core.resolveVersionPathNormalized(normalized);
                            newDeps.add(base);
                            const directParent = this.core.getBumpNumericParent()
                                ? PathUtils.directNumericParentPath(normalized)
                                : null;
                            if (directParent)
                                newDeps.add(directParent);
                        }
                    }
                    for (const d of newDeps) {
                        if (!depRefs.has(d))
                            depRefs.set(d, this.core.getVersion(d));
                    }
                    for (const key of Array.from(depRefs.keys())) {
                        if (!newDeps.has(key))
                            depRefs.delete(key);
                    }
                    depRefs.forEach((ref) => ref());
                    if (result && typeof result === 'object') {
                        return (Array.isArray(result) ? [...result] : { ...result });
                    }
                    return result;
                });
            })();
        try {
            this.core.setSignalInProxyCache(full, computedSignal);
        }
        catch (e) {
            console.warn('ComputedService setSignalInProxyCache error:', e);
        }
        this.computedStore.set(full, computedSignal);
        return computedSignal;
    }
    getAutoComputed(pathKey) {
        const key = this.getAutoComputedKey(pathKey);
        return this.computedStore.get(key) || undefined;
    }
    deleteAutoComputed(pathKey) {
        const key = this.getAutoComputedKey(pathKey);
        this.remove(key);
    }
    getAutoComputedKey(pathKey) {
        const keySegments = Array.from(this.core.getPathSegments(pathKey));
        return ['$autoComputed', ...keySegments].join('.');
    }
}

/**
 * Manages deferred cleanup operations with automatic cancellation.
 * Eliminates code duplication for timer-based cleanup logic.
 */
class CleanupScheduler {
    timers = new Map();
    /**
     * Schedule a cleanup operation for a given key (path).
     * Automatically cancels any existing timer for the same key.
     */
    schedule(key, cleanupFn, delayMs) {
        const normalized = PathUtils.normalizePath(key);
        this.cancel(normalized);
        const timer = setTimeout(() => {
            this.timers.delete(normalized);
            try {
                cleanupFn();
            }
            catch (error) {
                // Silently ignore cleanup errors to prevent crashes
                console.warn(`Cleanup failed for key "${normalized}":`, error);
            }
        }, delayMs);
        this.timers.set(normalized, timer);
    }
    /**
     * Cancel a scheduled cleanup operation.
     */
    cancel(key) {
        const normalized = PathUtils.normalizePath(key);
        const timer = this.timers.get(normalized);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(normalized);
        }
    }
    /**
     * Cancel all scheduled cleanup operations.
     */
    cancelAll() {
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();
    }
    /**
     * Check if a cleanup is scheduled for a given key.
     */
    isScheduled(key) {
        const normalized = PathUtils.normalizePath(key);
        return this.timers.has(normalized);
    }
    /**
     * Get count of scheduled cleanups.
     */
    get size() {
        return this.timers.size;
    }
    /**
     * Get all scheduled keys.
     */
    keys() {
        return Array.from(this.timers.keys());
    }
    /**
     * Clear all timers without executing cleanup functions.
     */
    destroy() {
        this.cancelAll();
    }
}

/**
 * Centralized configuration constants for the store.
 * Eliminates magic numbers and provides single source of truth for defaults.
 */
class StoreConfig {
    // Metrics and performance
    static METRICS_THROTTLE_MS = 250;
    static METRICS_INTERVAL_MS = 2000;
    // Cleanup and garbage collection
    static BEHAVIOR_CLEANUP_DELAY_MS = 50;
    static CURSOR_RESET_DELAY_MS = 0; // microtask
    // Cache limits
    static PROXY_CACHE_MAX_SIZE = 1000;
    static PATH_PLAN_CACHE_MAX_SIZE = 500;
    // Batch operations
    static VERSION_BUMP_BATCH_DELAY_MS = 0; // microtask via Promise.resolve()
    static AUTO_BATCH_BUMPS_DEFAULT = false;
    // Version bump optimization
    static VERSION_BUMP_STRATEGY_DEFAULT = 'microtask';
    static VERSION_BUMP_THROTTLE_MS_DEFAULT = 0;
    static VERSION_PARTIAL_INVALIDATION_DEFAULT = false;
    // DevTools
    static DEVTOOLS_EMIT_THROTTLE_MS = 50;
    // Dependency tracking
    static DEPENDENCY_MODE_DEFAULT = 'exact';
    static TRACK_READS_DEFAULT = true;
    static CLONE_COMPUTED_OUTPUTS_DEFAULT = true;
    static BEHAVIOR_UPDATES_ENABLED_DEFAULT = true;
    static BUMP_NUMERIC_PARENT_DEFAULT = true;
}

class TrackedBehaviorSubject extends BehaviorSubject {
    onSubscribe;
    onUnsubscribe;
    constructor(initialValue, onSubscribe, onUnsubscribe) {
        super(initialValue);
        this.onSubscribe = onSubscribe;
        this.onUnsubscribe = onUnsubscribe;
    }
    subscribe(observerOrNext, error, complete) {
        this.onSubscribe();
        let subscription;
        try {
            subscription = super.subscribe(observerOrNext, error, complete);
        }
        catch (error) {
            this.onUnsubscribe();
            throw error;
        }
        if (subscription.closed) {
            this.onUnsubscribe();
            return subscription;
        }
        let finalized = false;
        subscription.add(() => {
            if (finalized)
                return;
            finalized = true;
            this.onUnsubscribe();
        });
        return subscription;
    }
}
/**
 * Manages BehaviorSubject cache for a single store instance with subscription tracking and cleanup.
 * Refaktoryzacja z użyciem BaseManager, FlatStoreMap i CleanupScheduler.
 */
class BehaviorService extends BaseManager {
    behaviorStore = new FlatStoreMap();
    behaviorSubscriptionCount = new FlatStoreMap();
    cleanupScheduler = new CleanupScheduler();
    constructor(core, storeName) {
        super(core, storeName);
    }
    // helpers - using BaseManager methods
    scheduleCleanup(path) {
        this.cleanupScheduler.schedule(path, () => {
            const count = this.behaviorSubscriptionCount.get(path) || 0;
            if (count > 0)
                return;
            this.removeBehaviorNode(path, 'cleanup');
            this.emitSubscriptionStats();
        }, StoreConfig.BEHAVIOR_CLEANUP_DELAY_MS);
    }
    completeSubject(subject, context) {
        try {
            subject?.complete?.();
        }
        catch (e) {
            console.warn(`BehaviorService ${context} error:`, e);
        }
    }
    removeBehaviorNode(path, context) {
        this.completeSubject(this.behaviorStore.get(path), context);
        this.behaviorStore.delete(path);
        this.behaviorSubscriptionCount.delete(path);
    }
    emitSubscriptionStats() {
        if (!this.devActive)
            return;
        const stats = this.getSubscriptionStats();
        this.emitDevTools({
            type: 'BEHAVIOR_STORE_UPDATE',
            payload: {
                storeName: this.storeName,
                action: 'update',
                path: 'behavior-subscriptions',
                keys: [],
                ...stats,
                graph: undefined
            }
        });
    }
    cancelScheduledCleanup(pathPrefix) {
        if (!pathPrefix) {
            this.cleanupScheduler.cancelAll();
            return;
        }
        const normalized = this.normalizePath(pathPrefix);
        const pref = normalized ? `${normalized}.` : '';
        for (const key of this.cleanupScheduler.keys()) {
            if (key === normalized || key.startsWith(pref)) {
                this.cleanupScheduler.cancel(key);
            }
        }
    }
    // API
    add(path) {
        this.behaviorStore.addIfMissing(path, (normalizedPath) => {
            const initialValue = this.readStore(normalizedPath);
            this.behaviorSubscriptionCount.set(normalizedPath, 0);
            return new TrackedBehaviorSubject(initialValue, () => {
                this.cleanupScheduler.cancel(normalizedPath);
                const currentCount = this.behaviorSubscriptionCount.get(normalizedPath) || 0;
                this.behaviorSubscriptionCount.set(normalizedPath, currentCount + 1);
                this.emitSubscriptionStats();
            }, () => {
                const count = this.behaviorSubscriptionCount.get(normalizedPath) || 0;
                const next = count - 1;
                this.behaviorSubscriptionCount.set(normalizedPath, next > 0 ? next : 0);
                if (next <= 0) {
                    this.scheduleCleanup(normalizedPath);
                }
                this.emitSubscriptionStats();
            });
        });
    }
    getTrackedObservable(path) {
        return this.get(path).asObservable();
    }
    get(path) {
        this.add(path);
        return this.behaviorStore.get(path);
    }
    getIfExists(path) {
        return super.pathHasValue(path) ? this.peek(path) : undefined;
    }
    // Zwróć istniejący BehaviorSubject bez tworzenia nowego (peek)
    peek(path) {
        return this.behaviorStore.get(path);
    }
    // Zaktualizuj wszystkie istniejące BehaviorSubject-y na ścieżce i jej przodkach
    updateBySegments(path, newValue) {
        const paths = PathUtils.enumerateAncestors(path);
        for (let i = 0; i < paths.length; i++) {
            const currentPath = paths[i];
            const bs = this.peek(currentPath);
            if (!bs)
                continue; // emituj wyłącznie dla już istniejących BS
            const valueToEmit = i === 0 ? newValue : this.readStore(currentPath);
            try {
                bs.next(valueToEmit);
            }
            catch (e) {
                console.warn('BehaviorService emit error:', e);
            }
        }
    }
    /**
     * Update all existing BehaviorSubjects under the given prefix (including the prefix).
     * This keeps nested subscriptions in sync after array reindexing or bulk updates.
     */
    updateByPrefix(prefix, options = {}) {
        const keys = this.behaviorStore.getByPrefix(prefix);
        if (!keys.length)
            return;
        const normalized = this.normalizePath(prefix);
        for (const key of keys) {
            if (options.skipSelf && key === normalized)
                continue;
            const bs = this.behaviorStore.get(key);
            if (!bs)
                continue;
            const value = this.readStore(key);
            try {
                bs.next(value);
            }
            catch (e) {
                console.warn('BehaviorService emit error:', e);
            }
        }
    }
    updateDescendantsByPrefix(prefix) {
        this.updateByPrefix(prefix, { skipSelf: true });
    }
    getWithPipe(path, pipeFn) {
        const subject = this.get(path);
        return pipeFn ? pipeFn(subject) : this.getTrackedObservable(path);
    }
    // stats
    getSubscriptionCount(path) {
        return this.behaviorSubscriptionCount.get(path) || 0;
    }
    hasActiveSubscriptions(path) {
        return this.getSubscriptionCount(path) > 0;
    }
    getSubscriptionStats() {
        const details = [];
        const keys = this.behaviorStore.keys();
        for (const k of keys) {
            const count = this.behaviorSubscriptionCount.get(k) || 0;
            const hasValue = this.behaviorStore.has(k);
            details.push({ path: k, count, hasValue });
        }
        return {
            totalNodes: details.length,
            activeSubscriptions: details.reduce((sum, d) => sum + d.count, 0),
            inactiveNodes: details.filter((d) => d.count === 0).length,
            subscriptionDetails: details,
        };
    }
    // management
    isExists(path) {
        return this.behaviorStore.has(path);
    }
    keys() {
        return this.behaviorStore.keys();
    }
    store() {
        return this.behaviorStore.toObject();
    }
    delete(path) {
        this.cancelScheduledCleanup(path);
        this.behaviorStore.deleteByPrefix(path, (_, subject) => {
            this.completeSubject(subject, 'delete cleanup');
        });
        this.behaviorSubscriptionCount.deleteByPrefix(path);
    }
    cleanup(pathPrefix) {
        this.cancelScheduledCleanup(pathPrefix);
        if (!pathPrefix) {
            this.behaviorStore.forEach((subject) => {
                this.completeSubject(subject, 'cleanup');
            });
            this.behaviorStore.clear();
            this.behaviorSubscriptionCount.clear();
            return;
        }
        this.behaviorStore.deleteByPrefix(pathPrefix, (_, subject) => {
            this.completeSubject(subject, 'cleanup');
        });
        this.behaviorSubscriptionCount.deleteByPrefix(pathPrefix);
    }
    destroy() {
        this.cleanupScheduler.destroy();
        this.cleanup();
    }
    cleanupInactive(pathPrefix) {
        const keysToClean = [];
        if (!pathPrefix) {
            // Cleanup all inactive nodes
            this.behaviorStore.forEach((_, key) => {
                if ((this.behaviorSubscriptionCount.get(key) || 0) === 0) {
                    keysToClean.push(key);
                }
            });
        }
        else {
            // Cleanup inactive nodes under prefix
            const normalized = this.normalizePath(pathPrefix.replace(/\.$/, ''));
            const prefixMatch = normalized ? normalized + '.' : '';
            this.behaviorStore.forEach((_, key) => {
                if ((key === normalized || key.startsWith(prefixMatch)) && (this.behaviorSubscriptionCount.get(key) || 0) === 0) {
                    keysToClean.push(key);
                }
            });
        }
        // Perform cleanup
        for (const key of keysToClean) {
            this.removeBehaviorNode(key, 'cleanup');
        }
        this.emitSubscriptionStats();
    }
}

class ManageFinalizationRegistry {
    finalizationRegistry;
    onCleanup;
    registeredKeys = new Set();
    constructor(onCleanup) {
        this.onCleanup = onCleanup;
        if (typeof globalThis.FinalizationRegistry !== 'undefined') {
            this.finalizationRegistry = new FinalizationRegistry((key) => {
                this.onCleanup(key);
                this.registeredKeys.delete(key);
            });
        }
    }
    create(value, key) {
        const ref = new WeakRef(value);
        if (this.finalizationRegistry) {
            this.finalizationRegistry.register(value, key);
            this.registeredKeys.add(key);
        }
        return ref;
    }
    unregister(value, key) {
        if (this.finalizationRegistry) {
            this.finalizationRegistry.unregister(value);
            this.registeredKeys.delete(key);
        }
    }
    hasRegistered(key) {
        return this.registeredKeys.has(key);
    }
    getRegisteredKeys() {
        return Array.from(this.registeredKeys);
    }
    reset() {
        // FinalizationRegistry nie udostępnia metody clear, więc tylko nullujemy referencję
        this.finalizationRegistry = undefined;
        this.registeredKeys.clear();
    }
}

/**
 * Universal cache metrics tracker.
 * Eliminates duplicated metrics logic in ProxyCacheManager, FlatStoreMap, etc.
 */
class CacheMetricsTracker {
    hits = 0;
    misses = 0;
    hit() { this.hits++; }
    miss() { this.misses++; }
    snapshot() {
        const total = this.hits + this.misses;
        return {
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? this.hits / total : 0,
        };
    }
    reset() {
        this.hits = 0;
        this.misses = 0;
    }
}

class PathRingOrder {
    entries = [];
    head = 0;
    nextToken = 0;
    liveTokens = Object.create(null);
    liveCount = 0;
    add(key) {
        if (this.liveTokens[key] === undefined) {
            this.liveCount++;
        }
        const token = ++this.nextToken;
        this.liveTokens[key] = token;
        this.entries.push({ key, token });
        this.compactIfSparse();
    }
    delete(key) {
        if (this.liveTokens[key] === undefined)
            return;
        delete this.liveTokens[key];
        this.liveCount--;
    }
    deleteByPrefix(prefix) {
        const pref = prefix ? `${prefix}.` : '';
        this.deleteWhere((key) => key === prefix || (!!pref && key.startsWith(pref)));
    }
    deleteWhere(predicate) {
        for (const key of Object.keys(this.liveTokens)) {
            if (predicate(key))
                this.delete(key);
        }
        this.compactIfSparse();
    }
    evictOver(maxSize, onEvict, keep) {
        while (this.liveCount > maxSize) {
            const oldest = this.shiftOldest(keep);
            if (!oldest)
                break;
            onEvict(oldest);
        }
        this.compactIfSparse();
    }
    keys(keep) {
        this.compact(keep);
        const keys = [];
        for (let index = this.head; index < this.entries.length; index++) {
            const entry = this.entries[index];
            if (this.liveTokens[entry.key] === entry.token)
                keys.push(entry.key);
        }
        return keys;
    }
    some(predicate) {
        for (let index = this.head; index < this.entries.length; index++) {
            const entry = this.entries[index];
            if (this.liveTokens[entry.key] === entry.token && predicate(entry.key))
                return true;
        }
        return false;
    }
    clear() {
        this.entries = [];
        this.head = 0;
        this.liveTokens = Object.create(null);
        this.liveCount = 0;
    }
    shiftOldest(keep) {
        while (this.head < this.entries.length) {
            const entry = this.entries[this.head++];
            if (this.liveTokens[entry.key] !== entry.token)
                continue;
            if (keep && !keep(entry.key)) {
                this.delete(entry.key);
                continue;
            }
            this.delete(entry.key);
            return entry.key;
        }
        return undefined;
    }
    compact(keep) {
        const next = [];
        for (let index = this.head; index < this.entries.length; index++) {
            const entry = this.entries[index];
            if (this.liveTokens[entry.key] !== entry.token)
                continue;
            if (keep && !keep(entry.key)) {
                this.delete(entry.key);
                continue;
            }
            next.push(entry);
        }
        this.entries = next;
        this.head = 0;
    }
    compactIfSparse() {
        if (this.head < 256 && this.entries.length <= Math.max(512, this.liveCount * 4))
            return;
        this.compact();
    }
}
class ProxyCacheManager {
    storeName;
    signalStore;
    cache = Object.create(null);
    signalCache = Object.create(null);
    cacheOrder = new PathRingOrder();
    metrics = new CacheMetricsTracker();
    finalizer;
    constructor(storeName, signalStore) {
        this.storeName = storeName;
        this.signalStore = signalStore;
        this.finalizer = new ManageFinalizationRegistry((path) => {
            this.delete(path);
        });
    }
    get(path) {
        const proxy = this.peek(path);
        if (proxy) {
            this.metrics.hit();
        }
        return proxy;
    }
    peek(path) {
        const normalized = PathUtils.normalizePath(path);
        const ref = this.cache[normalized];
        if (!ref)
            return undefined;
        const proxy = ref.deref();
        if (!proxy) {
            this.delete(normalized);
            return undefined;
        }
        return proxy;
    }
    getOrCreate(path, factory, valueReader) {
        const normalized = PathUtils.normalizePath(path);
        const cached = this.peek(normalized);
        if (cached) {
            this.metrics.hit();
            return cached;
        }
        const value = valueReader(normalized);
        if (value === undefined) {
            return undefined;
        }
        const proxy = factory(normalized, value);
        this.storeEntry(normalized, proxy);
        this.metrics.miss();
        this.evictIfNeeded();
        return proxy;
    }
    add(path, proxy) {
        const normalized = PathUtils.normalizePath(path);
        this.storeEntry(normalized, proxy);
        this.evictIfNeeded();
    }
    delete(path) {
        const normalized = PathUtils.normalizePath(path);
        this.deleteByPrefix(this.cache, normalized);
        this.deleteByPrefix(this.signalCache, normalized);
        this.cacheOrder.deleteByPrefix(normalized);
    }
    cleanup(pathPrefix) {
        if (!pathPrefix) {
            this.reset();
            return;
        }
        this.delete(pathPrefix);
    }
    reset() {
        this.cache = Object.create(null);
        this.signalCache = Object.create(null);
        this.cacheOrder.clear();
        this.metrics.reset();
    }
    metricsSnapshot() {
        const cacheKeys = this.keys();
        return {
            ...this.metrics.snapshot(),
            cacheSize: cacheKeys.length,
            cacheKeys
        };
    }
    emitMetrics(metrics) {
        if (!this.signalStore.devActive)
            return;
        const cacheDump = this.dump();
        const proxyAction = {
            type: 'PROXY_METRICS',
            payload: {
                path: 'proxy-cache',
                ...metrics,
                cacheDump,
                cacheKeys: cacheDump.map(({ key }) => key),
                graph: undefined
            }
        };
        this.signalStore.emitDevAction(this.storeName, proxyAction);
    }
    getSignal(path) {
        const normalized = PathUtils.normalizePath(path);
        const ref = this.signalCache[normalized];
        if (!ref)
            return undefined;
        const signal = ref.deref();
        if (!signal) {
            delete this.signalCache[normalized];
            return undefined;
        }
        return signal;
    }
    setSignal(path, signalRef) {
        if (!signalRef)
            return;
        const normalized = PathUtils.normalizePath(path);
        this.signalCache[normalized] = new WeakRef(signalRef);
    }
    keys() {
        return this.cacheOrder.keys((key) => this.isLiveProxyKey(key));
    }
    entries() {
        return { ...this.cache };
    }
    isCached(path) {
        return this.existsInMap(this.cache, path, (v) => !!v.deref?.());
    }
    hasIndexedChildAtOrAfter(path, startIndex) {
        const normalized = PathUtils.normalizePath(path);
        const prefix = normalized ? `${normalized}.` : '';
        if (!prefix)
            return false;
        if (this.cacheOrder.some((key) => this.isIndexedChildAtOrAfter(key, prefix, startIndex)))
            return true;
        for (const key of Object.keys(this.signalCache)) {
            if (this.isIndexedChildAtOrAfter(key, prefix, startIndex))
                return true;
        }
        return false;
    }
    deleteIndexedRange(path, startIndex, endIndex) {
        if (startIndex < 0 || endIndex <= startIndex)
            return;
        const normalized = PathUtils.normalizePath(path);
        const prefix = normalized ? `${normalized}.` : '';
        if (!prefix)
            return;
        const shouldDelete = (key) => this.isIndexedChildInRange(key, prefix, startIndex, endIndex);
        this.deleteWhere(this.cache, shouldDelete);
        this.deleteWhere(this.signalCache, shouldDelete);
        this.cacheOrder.deleteWhere(shouldDelete);
    }
    markHit() {
        this.metrics.hit();
    }
    markMiss() {
        this.metrics.miss();
    }
    dump() {
        return this.keys().map((key) => ({ key, value: '[ProxyCallable]' }));
    }
    getMaxCacheSize() {
        const configured = this.signalStore.getProxyCacheLimit(this.storeName);
        if (typeof configured === 'number' && Number.isFinite(configured)) {
            return Math.max(0, Math.floor(configured));
        }
        return 1000;
    }
    storeEntry(path, proxy) {
        const normalized = PathUtils.normalizePath(path);
        this.cache[normalized] = this.finalizer.create(proxy, normalized);
        this.cacheOrder.add(normalized);
    }
    evictIfNeeded() {
        const maxSize = this.getMaxCacheSize();
        if (maxSize < 0)
            return;
        this.cacheOrder.evictOver(maxSize, (oldest) => {
            delete this.cache[oldest];
            delete this.signalCache[oldest];
        }, (key) => this.isLiveProxyKey(key));
    }
    compactOrder() {
        this.cacheOrder.keys((key) => this.isLiveProxyKey(key));
    }
    existsInMap(map, path, predicate) {
        const normalized = PathUtils.normalizePath(path);
        const value = map[normalized];
        return value !== undefined && (!predicate || predicate(value));
    }
    isIndexedChildAtOrAfter(key, prefix, startIndex) {
        if (!key.startsWith(prefix))
            return false;
        const dotIndex = key.indexOf('.', prefix.length);
        const segment = dotIndex === -1 ? key.slice(prefix.length) : key.slice(prefix.length, dotIndex);
        if (!segment)
            return false;
        const index = Number(segment);
        return Number.isInteger(index) && index >= startIndex;
    }
    isIndexedChildInRange(key, prefix, startIndex, endIndex) {
        if (!key.startsWith(prefix))
            return false;
        const dotIndex = key.indexOf('.', prefix.length);
        const segment = dotIndex === -1 ? key.slice(prefix.length) : key.slice(prefix.length, dotIndex);
        if (!segment)
            return false;
        const index = Number(segment);
        return Number.isInteger(index) && index >= startIndex && index < endIndex;
    }
    isLiveProxyKey(key) {
        const ref = this.cache[key];
        if (ref?.deref())
            return true;
        delete this.cache[key];
        delete this.signalCache[key];
        return false;
    }
    deleteByPrefix(map, prefix, onDelete) {
        const normalized = PathUtils.normalizePath(prefix);
        const pref = normalized ? normalized + '.' : '';
        for (const key of Object.keys(map)) {
            if (key === normalized || key.startsWith(pref)) {
                if (onDelete) {
                    try {
                        onDelete(key, map[key]);
                    }
                    catch {
                        // ignore cleanup errors
                    }
                }
                delete map[key];
            }
        }
    }
    deleteWhere(map, predicate, onDelete) {
        for (const key of Object.keys(map)) {
            if (!predicate(key))
                continue;
            if (onDelete) {
                try {
                    onDelete(key, map[key]);
                }
                catch {
                    // ignore cleanup errors
                }
            }
            delete map[key];
        }
    }
}

/**
 * Universal path traversal engine.
 * Eliminates duplicated path-reading logic across:
 * - PathUtils.getByPath
 * - CreateStoreService.fastReadBySegments
 * - ProxyFactory.getValueIteratively
 * - BaseProxyHandler.resolveValue
 */
class PathReader {
    /**
     * Read a value by path from an object root.
     * SSOT for all store reads.
     */
    read(root, path) {
        if (!root || !path)
            return undefined;
        const segments = this.getSegments(path);
        return this.readBySegments(root, segments);
    }
    /**
     * Fast read using pre-split segments.
     */
    readBySegments(root, segments) {
        if (!root || segments.length === 0)
            return root;
        let current = root;
        for (const segment of segments) {
            if (current == null)
                return undefined;
            current = current[segment];
        }
        return current;
    }
    /**
     * Get cached segments for a path.
     */
    getSegments(path) {
        const normalized = PathUtils.normalizePath(path);
        if (!normalized)
            return [];
        return PathUtils.splitNormalizedPath(normalized);
    }
}

/**
 * Schedules version signal bumps with optional batching, RAF scheduling and throttling.
 * Extracted from CreateStoreService so the lifecycle is explicit and testable.
 */
class VersionBumpScheduler {
    flush;
    depth = 0;
    pending = new Set();
    scheduled = false;
    strategy = 'microtask';
    throttle = 0;
    lastFlush = 0;
    rafId = null;
    timeoutId = null;
    constructor(flush) {
        this.flush = flush;
    }
    begin() {
        this.depth++;
    }
    end() {
        if (this.depth === 0)
            return;
        this.depth--;
        if (this.depth === 0)
            this.schedule();
    }
    flushNow() {
        if (this.depth > 0)
            return;
        this.scheduled = false;
        if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(this.rafId);
        }
        this.rafId = null;
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        if (this.pending.size === 0)
            return;
        const items = new Set(this.pending);
        this.pending.clear();
        this.flush(items);
        this.lastFlush = Date.now();
    }
    queue(paths) {
        for (const path of paths)
            this.pending.add(path);
    }
    setStrategy(strategy) {
        this.strategy = strategy;
    }
    setThrottle(ms) {
        this.throttle = Math.max(0, ms);
    }
    schedule() {
        if (this.scheduled)
            return;
        this.scheduled = true;
        if (this.strategy === 'raf' && typeof requestAnimationFrame !== 'undefined') {
            this.rafId = requestAnimationFrame(() => this.execute());
        }
        else {
            Promise.resolve().then(() => this.execute());
        }
    }
    destroy() {
        this.pending.clear();
        this.depth = 0;
        this.scheduled = false;
        this.lastFlush = 0;
        if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(this.rafId);
        }
        this.rafId = null;
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
        }
        this.timeoutId = null;
    }
    execute() {
        this.scheduled = false;
        this.rafId = null;
        if (this.pending.size === 0)
            return;
        if (this.throttle > 0) {
            const now = Date.now();
            if (now - this.lastFlush < this.throttle) {
                this.timeoutId = setTimeout(() => {
                    this.timeoutId = null;
                    this.execute();
                }, this.throttle - (now - this.lastFlush));
                return;
            }
            this.lastFlush = now;
        }
        const items = new Set(this.pending);
        this.pending.clear();
        this.flush(items);
    }
}

/**
 * Abstract base for reactive node managers (Behavior, Computed, Version).
 * Eliminates duplicated prefix-cleanup, devtools emission, and store-access logic.
 */
class ReactiveNodeManager {
    storeMap = new FlatStoreMap();
    storeName;
    readStore;
    devActive;
    constructor(storeName, readStore, devActive) {
        this.storeName = storeName;
        this.readStore = readStore;
        this.devActive = devActive;
    }
    add(path) {
        return this.storeMap.getOrCreate(path, (normalizedPath) => {
            const initialValue = this.readStore(normalizedPath);
            return this.createNode(normalizedPath, initialValue);
        });
    }
    get(path) {
        return this.storeMap.get(path);
    }
    peek(path) {
        return this.storeMap.get(path);
    }
    has(path) {
        return this.storeMap.has(path);
    }
    keys() {
        return this.storeMap.keys();
    }
    store() {
        return this.storeMap.toObject();
    }
    delete(path) {
        this.storeMap.deleteByPrefix(path, (key, node) => {
            this.onDelete?.(key, node);
        });
    }
    cleanup(pathPrefix) {
        if (!pathPrefix) {
            this.storeMap.forEach((node, key) => this.onDelete?.(key, node));
            this.storeMap.clear();
            return;
        }
        this.delete(pathPrefix);
    }
    getByPrefix(prefix) {
        return this.storeMap.getByPrefix(prefix);
    }
    count() {
        return this.storeMap.keys().length;
    }
}

/**
 * VersionManager: stores version signals per path.
 * Refactored with ReactiveNodeManager base.
 */
class VersionManager extends BaseManager {
    nodeManager = new (class extends ReactiveNodeManager {
        createNode(_path) {
            return signal(0);
        }
        onDelete(_path, _node) { }
    })(this.storeName, (_path) => undefined, // version signals don't need store value
    () => this.devActive);
    constructor(core, storeName) {
        super(core, storeName);
    }
    get(path) {
        return this.nodeManager.add(path);
    }
    updateIfExists(path) {
        const node = this.nodeManager.peek(path);
        if (!node)
            return;
        node.update((n) => n + 1);
        this.emitDevtoolsUpdate('update', this.normalizePath(path));
    }
    cleanup(pathPrefix) {
        this.nodeManager.cleanup(pathPrefix);
        this.emitDevtoolsUpdate('remove', pathPrefix ? this.normalizePath(pathPrefix) : '');
    }
    keys() {
        return this.nodeManager.keys();
    }
    hasNodes() {
        return this.nodeManager.count() > 0;
    }
    emitDevtoolsUpdate(actionType, path) {
        if (!this.devActive)
            return;
        this.emitDevTools({
            type: 'VERSION_STORE_UPDATE',
            payload: { storeName: this.storeName, action: actionType, path, keys: this.keys(), graph: undefined }
        });
    }
}

class DependencyTracker {
    activeCollector = null;
    trackReads = true;
    startCollect() {
        this.activeCollector = new Set();
    }
    stopCollect() {
        const collector = this.activeCollector;
        this.activeCollector = null;
        return collector;
    }
    registerRead(path) {
        if (!this.trackReads || !this.activeCollector)
            return;
        this.activeCollector.add(PathUtils.normalizePath(path));
    }
    registerReadNormalized(path) {
        if (!this.trackReads || !this.activeCollector)
            return;
        this.activeCollector.add(path);
    }
    setTrackReads(enabled) {
        this.trackReads = !!enabled;
    }
    getTrackReads() {
        return this.trackReads;
    }
    isCollecting() {
        return this.trackReads && this.activeCollector !== null;
    }
    trackProjection(project) {
        this.startCollect();
        let value;
        let hasError = false;
        let capturedError;
        try {
            value = project();
        }
        catch (error) {
            hasError = true;
            capturedError = error;
        }
        const depSet = this.stopCollect() ?? new Set();
        if (hasError)
            throw capturedError;
        return { value, deps: Array.from(depSet) };
    }
}

class VersionBumpCoordinator {
    policy;
    scheduler;
    hooks;
    // Insertion-order FIFO cache. Version target calculation is pure, so eviction only affects performance.
    ancestorPathCache = new Map();
    static MAX_ANCESTOR_CACHE_SIZE = 1000;
    ancestorCacheHits = 0;
    ancestorCacheMisses = 0;
    ancestorCacheEvictions = 0;
    explicitBumpTargets = {
        grained: (normalized) => [normalized],
        leaf: (normalized) => [...this.getAncestorPaths(normalized)].reverse(),
    };
    policyBumpTargets = {
        partial: (normalized) => {
            this.hooks.updateIfExists(normalized);
            return [];
        },
        branch: (normalized) => this.getAncestorPaths(normalized),
    };
    constructor(policy, scheduler, hooks) {
        this.policy = policy;
        this.scheduler = scheduler;
        this.hooks = hooks;
    }
    resolvePath(path) {
        return this.resolveNormalizedPath(PathUtils.normalizePath(path));
    }
    resolveNormalizedPath(normalized) {
        return PathUtils.resolveVersionPath(normalized, {
            dependencyMode: this.policy.getDependencyMode(),
            bumpNumericParent: this.policy.getBumpNumericParent()
        });
    }
    bumpPath(path) {
        this.bumpWithTargets(path, this.getPolicyBumpTarget());
    }
    bumpPathNormalized(normalized) {
        this.bumpWithNormalizedTargets(normalized, this.getPolicyBumpTarget());
    }
    bumpExact(path) {
        this.bumpWithTargets(path, this.explicitBumpTargets.grained);
    }
    bumpExactNormalized(normalized) {
        this.bumpWithNormalizedTargets(normalized, this.explicitBumpTargets.grained);
    }
    bumpLeafBranch(path) {
        this.bumpWithTargets(path, this.explicitBumpTargets.leaf);
    }
    bumpLeafBranchNormalized(normalized) {
        this.bumpWithNormalizedTargets(normalized, this.explicitBumpTargets.leaf);
    }
    bumpDescendants(pathPrefix) {
        this.bumpDescendantsNormalized(PathUtils.normalizePath(pathPrefix));
    }
    bumpDescendantsNormalized(normalized) {
        if (!this.hooks.hasExistingNodes())
            return;
        const prefix = `${normalized}.`;
        const targets = [];
        for (const key of this.hooks.keys()) {
            if (key.startsWith(prefix))
                targets.push(key);
        }
        this.applyTargets(targets);
    }
    bumpFromPatches(patches) {
        if (!Array.isArray(patches) || patches.length === 0)
            return;
        const toBump = new Set();
        for (const patch of patches) {
            if (!patch || !Array.isArray(patch.path))
                continue;
            const segments = patch.path.map(String).filter(Boolean);
            if (segments.length === 0)
                continue;
            const path = segments.join('.');
            for (const target of PathUtils.enumerateAncestors(path, {
                includeNumericParent: this.policy.getBumpNumericParent()
            })) {
                toBump.add(target);
            }
            if (patch.op === 'remove')
                this.hooks.cleanup(path);
        }
        for (const path of toBump)
            this.hooks.updateIfExists(path);
    }
    clear() {
        this.ancestorPathCache.clear();
    }
    resetCache() {
        this.clear();
        this.ancestorCacheHits = 0;
        this.ancestorCacheMisses = 0;
        this.ancestorCacheEvictions = 0;
    }
    /**
     * Diagnostic cache metrics for tests, perf lab, and dev tooling.
     * These counters are local to this coordinator and reset with resetCache().
     */
    getCacheMetrics() {
        const total = this.ancestorCacheHits + this.ancestorCacheMisses;
        return {
            ancestorPathCache: {
                size: this.ancestorPathCache.size,
                maxSize: VersionBumpCoordinator.MAX_ANCESTOR_CACHE_SIZE,
                hits: this.ancestorCacheHits,
                misses: this.ancestorCacheMisses,
                evictions: this.ancestorCacheEvictions,
                hitRate: total > 0 ? this.ancestorCacheHits / total : 0,
            },
        };
    }
    destroy() {
        this.scheduler.destroy();
        this.clear();
    }
    getAncestorPaths(normalizedPath) {
        const cached = this.ancestorPathCache.get(normalizedPath);
        if (cached) {
            this.ancestorCacheHits++;
            return cached;
        }
        this.ancestorCacheMisses++;
        if (this.ancestorPathCache.size >= VersionBumpCoordinator.MAX_ANCESTOR_CACHE_SIZE) {
            const firstKey = this.ancestorPathCache.keys().next().value;
            if (firstKey) {
                this.ancestorPathCache.delete(firstKey);
                this.ancestorCacheEvictions++;
            }
        }
        const ancestors = PathUtils.enumerateAncestors(normalizedPath, {
            includeNumericParent: this.policy.getBumpNumericParent()
        });
        this.ancestorPathCache.set(normalizedPath, ancestors);
        return ancestors;
    }
    applyTargets(targets) {
        if (targets.length === 0)
            return;
        if (this.policy.getAutoBatchBumps()) {
            this.scheduler.queue(targets);
            this.scheduler.schedule();
            return;
        }
        for (const target of targets)
            this.hooks.updateIfExists(target);
    }
    bumpWithTargets(path, getTargets) {
        this.bumpWithNormalizedTargets(PathUtils.normalizePath(path), getTargets);
    }
    bumpWithNormalizedTargets(normalized, getTargets) {
        if (!this.hooks.hasNodes())
            return;
        this.applyTargets(getTargets(normalized));
    }
    getPolicyBumpTarget() {
        return this.policy.getPartialInvalidation()
            ? this.policyBumpTargets.partial
            : this.policyBumpTargets.branch;
    }
}

class VersionBumpPolicy {
    autoBatchBumps = false;
    bumpNumericParentForIndices = true;
    versionPartialInvalidation = false;
    dependencyMode = 'exact';
    setAutoBatchBumps(enabled) {
        this.autoBatchBumps = !!enabled;
    }
    getAutoBatchBumps() {
        return this.autoBatchBumps;
    }
    setBumpNumericParent(enabled) {
        this.bumpNumericParentForIndices = !!enabled;
    }
    getBumpNumericParent() {
        return this.bumpNumericParentForIndices;
    }
    setPartialInvalidation(enabled) {
        this.versionPartialInvalidation = !!enabled;
    }
    getPartialInvalidation() {
        return this.versionPartialInvalidation;
    }
    setDependencyMode(mode) {
        this.dependencyMode = mode;
    }
    getDependencyMode() {
        return this.dependencyMode;
    }
}

class ReactivityWakeupService {
    hooks;
    constructor(hooks) {
        this.hooks = hooks;
    }
    wakeUpPath(path, value, options = {}, behaviorUpdater) {
        return this.wakeUpPathNormalized(PathUtils.normalizePath(path), value, options, behaviorUpdater);
    }
    wakeUpPathNormalized(normalized, value, options = {}, behaviorUpdater) {
        const behaviorsEnabled = this.hooks.behaviorUpdatesEnabled();
        this.hooks.bumpVersionNormalized(normalized);
        if (behaviorsEnabled) {
            (behaviorUpdater ?? this.hooks.updateBehavior)(normalized, value);
            if (options.ensureBehavior)
                this.hooks.ensureBehavior(normalized);
        }
        if (options.syncDescendants)
            this.wakeUpBranchNormalized(normalized);
        return behaviorsEnabled;
    }
    performMutationWithWakeUp(path, value, mutateFn, options = {}, behaviorUpdater) {
        mutateFn();
        return this.wakeUpPath(path, value, options, behaviorUpdater);
    }
    wakeUpArrayPath(path, value, afterVersion, behaviorUpdater) {
        const normalized = PathUtils.normalizePath(path);
        this.hooks.bumpVersion(normalized);
        afterVersion?.();
        (behaviorUpdater ?? this.hooks.updateBehavior)(normalized, value);
        this.hooks.updateBehaviorByPrefix(normalized, { skipSelf: true });
    }
    wakeUpVersionOnly(path) {
        this.hooks.bumpVersion(PathUtils.normalizePath(path));
    }
    wakeUpBranch(pathPrefix) {
        this.wakeUpBranchNormalized(PathUtils.normalizePath(pathPrefix));
    }
    wakeUpBranchNormalized(normalized) {
        this.hooks.updateDescendantBehaviors(normalized);
        this.hooks.bumpDescendantVersionsNormalized(normalized);
        this.hooks.clearProxyCache(normalized);
    }
}

const STORE_WAKEUP_MODE_ALIASES = {
    leaf: 'leaf',
    grained: 'grained',
    granular: 'grained',
    exact: 'grained',
    graied: 'grained',
    graned: 'grained',
};
class CreateStoreService {
    storeName;
    signalStore;
    dependencyTracker = new DependencyTracker();
    usingComputedStoreFallback = false;
    startCollect() { this.dependencyTracker.startCollect(); }
    stopCollect() { return this.dependencyTracker.stopCollect(); }
    registerRead(path) { this.dependencyTracker.registerRead(path); }
    registerReadNormalized(path) { this.dependencyTracker.registerReadNormalized(path); }
    setTrackReads(enabled) { this.dependencyTracker.setTrackReads(enabled); }
    getTrackReads() { return this.dependencyTracker.getTrackReads(); }
    isCollectingReads() { return this.dependencyTracker.isCollecting(); }
    // Execute a projection within a read-tracking scope and return dependencies list
    trackProjection(project) {
        return this.dependencyTracker.trackProjection(project);
    }
    versionPolicy = new VersionBumpPolicy();
    setDependencyMode(mode) { this.versionPolicy.setDependencyMode(mode); }
    getDependencyMode() { return this.versionPolicy.getDependencyMode(); }
    // Dev-only helper to warn when dependency selection is too broad in 'container' mode
    warnOnWideDependencies(deps) {
        if (this.versionPolicy.getDependencyMode() !== 'container')
            return;
        // Heuristics: if many top-level deps or very short paths are tracked, warn in dev mode
        const shortDeps = deps.filter((d) => d.split('.').length <= 1);
        if (shortDeps.length > 0 && globalThis?.ngDevMode !== false) {
            console.warn('[SignalStore] Container dependency mode: very broad dependencies detected:', shortDeps.slice(0, 5));
        }
    }
    resolveVersionPath(path) {
        return this.versionBumpCoordinator.resolvePath(path);
    }
    resolveVersionPathNormalized(normalized) {
        return this.versionBumpCoordinator.resolveNormalizedPath(normalized);
    }
    pathReader = new PathReader();
    bumpScheduler = new VersionBumpScheduler((items) => {
        for (const p of items)
            this.updateVersionIfExists(p);
    });
    versionBumpCoordinator = new VersionBumpCoordinator(this.versionPolicy, this.bumpScheduler, {
        hasNodes: () => this._versionSvc?.hasNodes() ?? false,
        hasExistingNodes: () => this._versionSvc?.hasNodes() ?? false,
        keys: () => this._versionSvc?.keys() ?? [],
        updateIfExists: (path) => this.updateVersionIfExists(path),
        cleanup: (pathPrefix) => this.cleanupVersionStore(pathPrefix)
    });
    wakeupModeHandlers = {
        leaf: (normalized) => this.versionBumpCoordinator.bumpLeafBranch(normalized),
        grained: (normalized) => this.versionBumpCoordinator.bumpExact(normalized),
    };
    reactivityWakeup = new ReactivityWakeupService({
        behaviorUpdatesEnabled: () => this.behaviorUpdatesEnabled,
        updateBehavior: (path, value) => this.updateBehaviorsBySegments(path, value),
        ensureBehavior: (path) => this.addToBehaviorStore(path),
        bumpVersion: (path) => this.bumpVersionsFor(path),
        bumpVersionNormalized: (path) => this.bumpVersionsForNormalized(path),
        updateDescendantBehaviors: (pathPrefix) => this.updateDescendantBehaviorsByPrefix(pathPrefix),
        bumpDescendantVersions: (pathPrefix) => this.bumpDescendantVersionsFor(pathPrefix),
        bumpDescendantVersionsNormalized: (pathPrefix) => this.bumpDescendantVersionsForNormalized(pathPrefix),
        clearProxyCache: (pathPrefix) => this.clearProxyCacheForPath(pathPrefix),
        updateBehaviorByPrefix: (pathPrefix, options) => this.updateBehaviorByPrefix(pathPrefix, options)
    });
    beginAction() { this.bumpScheduler.begin(); }
    endAction() { this.bumpScheduler.end(); }
    flushPendingBumps() { this.bumpScheduler.flushNow(); }
    setAutoBatchBumps(enabled) { this.versionPolicy.setAutoBatchBumps(enabled); }
    getAutoBatchBumps() { return this.versionPolicy.getAutoBatchBumps(); }
    setBumpNumericParent(enabled) { this.versionPolicy.setBumpNumericParent(enabled); }
    getBumpNumericParent() { return this.versionPolicy.getBumpNumericParent(); }
    setVersionBumpStrategy(strategy) { this.bumpScheduler.setStrategy(strategy); }
    setVersionBumpThrottle(ms) { this.bumpScheduler.setThrottle(ms); }
    setPartialInvalidation(enabled) { this.versionPolicy.setPartialInvalidation(enabled); }
    /** Delegated to PathReader (universal path traversal engine) */
    getPathSegments(path) {
        return this.pathReader.getSegments(path);
    }
    /** No-op: PathReader handles its own cache eviction */
    clearPathSegmentCache(_pathPrefix) { }
    /** Delegated to PathReader */
    fastReadBySegments(root, pathSegments) {
        return this.pathReader.readBySegments(root, pathSegments);
    }
    // ------------------------------
    // Flat string-keyed stores - per instance (no storeName needed)
    // ------------------------------
    _versionSvc;
    get versionSvc() {
        if (!this._versionSvc)
            this._versionSvc = new VersionManager(this, this.storeName);
        return this._versionSvc;
    }
    cloneComputedOutputs = true;
    behaviorUpdatesEnabled = true;
    _storeProxy;
    devToolsEmitter = new DevToolsEmitter(() => this.signalStore.devActive, (event) => {
        const ds = this.signalStore.getDevtoolsAdapter();
        if (ds)
            ds.emitAction(event);
    }, (event) => {
        const ds = this.signalStore.getDevtoolsAdapter();
        if (ds)
            ds.emitRead(event);
    });
    // Lazy services for modular logic
    _computedSvc;
    _behaviorSvc;
    get computedSvc() {
        if (!this._computedSvc)
            this._computedSvc = new ComputedService(this, this.storeName);
        return this._computedSvc;
    }
    get behaviorSvc() {
        if (!this._behaviorSvc)
            this._behaviorSvc = new BehaviorService(this, this.storeName);
        return this._behaviorSvc;
    }
    // Public facade for behavior updates by segments
    updateBehaviorsBySegments(path, newValue) {
        if (!this.behaviorUpdatesEnabled)
            return;
        this._behaviorSvc?.updateBySegments(path, newValue);
    }
    wakeUpMutationPath(path, value, options = {}, behaviorUpdater) {
        return this.reactivityWakeup.wakeUpPath(path, value, options, behaviorUpdater);
    }
    wakeUpMutationPathNormalized(normalized, value, options = {}, behaviorUpdater) {
        return this.reactivityWakeup.wakeUpPathNormalized(normalized, value, options, behaviorUpdater);
    }
    performMutationWithWakeUp(path, value, mutateFn, options = {}, behaviorUpdater) {
        return this.reactivityWakeup.performMutationWithWakeUp(path, value, mutateFn, options, behaviorUpdater);
    }
    wakeUpArrayMutation(path, value, afterVersion, behaviorUpdater) {
        this.reactivityWakeup.wakeUpArrayPath(path, value, afterVersion, behaviorUpdater);
    }
    wakeUpVersionPath(path, mode) {
        if (!mode) {
            this.reactivityWakeup.wakeUpVersionOnly(path);
            return;
        }
        this.wakeUpVersionPathWithMode(path, mode);
    }
    wakeUpVersionPathWithMode(path, mode) {
        const normalized = PathUtils.normalizePath(path);
        this.getWakeupModeHandler(mode)(normalized);
    }
    getWakeupModeHandler(mode) {
        const canonicalMode = STORE_WAKEUP_MODE_ALIASES[mode];
        const handler = canonicalMode ? this.wakeupModeHandlers[canonicalMode] : undefined;
        if (!handler)
            throw new Error(`Unsupported wakeup mode: ${String(mode)}`);
        return handler;
    }
    // Type-safe selection API: select(fn) and computedOf(fn)
    getStoreProxy() {
        if (this._storeProxy) {
            this.usingComputedStoreFallback = false;
            return this._storeProxy;
        }
        try {
            this._storeProxy = this.signalStore.useStore(this.storeName);
            this.usingComputedStoreFallback = false;
            return this._storeProxy;
        }
        catch {
            // Fallback for standalone CreateStore instances (no proxy registered)
            this.usingComputedStoreFallback = true;
            return this.getComputedStore();
        }
    }
    select(project) {
        return new Observable((subscriber) => {
            const proxy = this.getStoreProxy();
            let depSub = null;
            let depKey = '';
            let hasValue = false;
            let lastValue;
            let closed = false;
            let computing = false;
            let pending = false;
            const toDepPaths = (deps) => {
                const tracked = deps.length === 0 && this.usingComputedStoreFallback
                    ? Object.keys(this.getComputedStore())
                    : deps;
                return Array.from(new Set(tracked.map((dep) => this.resolveVersionPathNormalized(dep)))).sort();
            };
            const resubscribe = (depPaths) => {
                const nextKey = depPaths.join('\0');
                if (nextKey === depKey)
                    return;
                depSub?.unsubscribe();
                depSub = null;
                depKey = nextKey;
                if (depPaths.length === 0)
                    return;
                let skipInitial = true;
                depSub = combineLatest(depPaths.map((depPath) => this.getTrackedObservable(depPath))).subscribe({
                    next: () => {
                        if (skipInitial) {
                            skipInitial = false;
                            return;
                        }
                        recompute();
                    },
                    error: (error) => {
                        subscriber.error(error);
                    }
                });
            };
            const recompute = () => {
                if (closed)
                    return;
                if (computing) {
                    pending = true;
                    return;
                }
                computing = true;
                try {
                    do {
                        pending = false;
                        const { value, deps } = this.trackProjection(() => project(proxy));
                        this.warnOnWideDependencies(deps);
                        if (!hasValue || !Object.is(value, lastValue)) {
                            lastValue = value;
                            hasValue = true;
                            subscriber.next(value);
                        }
                        resubscribe(toDepPaths(deps));
                    } while (pending && !closed);
                }
                catch (error) {
                    closed = true;
                    depSub?.unsubscribe();
                    subscriber.error(error);
                }
                finally {
                    computing = false;
                }
            };
            recompute();
            return () => {
                closed = true;
                depSub?.unsubscribe();
                depSub = null;
            };
        });
    }
    computedOf(project) {
        const proxy = this.getStoreProxy();
        return computed(() => {
            const { value, deps } = this.trackProjection(() => project(proxy));
            this.warnOnWideDependencies(deps);
            return value;
        });
    }
    // Observable method cache, stored as flat map
    observableMethodCache = Object.create(null);
    // Proxy cache orchestration
    proxyCacheManager;
    // Array-query Computed values są teraz buforowane w samym grafie computedStore
    constructor(storeName, signalStore) {
        this.storeName = storeName;
        this.signalStore = signalStore;
        this.proxyCacheManager = new ProxyCacheManager(this.storeName, this.signalStore);
    }
    // ------------------
    // Proxy cache operations (delegated to manager)
    // ------------------
    getProxyFromCache(path) {
        return this.proxyCacheManager.get(path);
    }
    getOrCreateProxy(path, createProxyFn, getValueFn) {
        return this.proxyCacheManager.getOrCreate(path, createProxyFn, getValueFn);
    }
    addProxyToCache(path, proxy) {
        this.proxyCacheManager.add(path, proxy);
    }
    deleteProxyFromCache(path) {
        this.proxyCacheManager.delete(path);
    }
    isProxyInCache(path) {
        return this.proxyCacheManager.isCached(path);
    }
    hasIndexedProxyCacheFrom(path, startIndex) {
        return this.proxyCacheManager.hasIndexedChildAtOrAfter(path, startIndex);
    }
    deleteIndexedProxyCacheRange(path, startIndex, endIndex) {
        this.proxyCacheManager.deleteIndexedRange(path, startIndex, endIndex);
    }
    hasIndexedDerivedNodeFrom(path, startIndex) {
        return this.hasIndexedPathFromKeys(this._behaviorSvc?.keys() ?? [], path, startIndex)
            || this.hasIndexedPathFromKeys(this._computedSvc?.keys() ?? [], path, startIndex)
            || this.hasIndexedPathFromKeys(this._versionSvc?.keys() ?? [], path, startIndex);
    }
    getProxyCacheKeys() {
        return this.proxyCacheManager.keys();
    }
    getProxyCache() {
        return this.proxyCacheManager.entries();
    }
    cleanupProxyCache(pathPrefix) {
        this.proxyCacheManager.cleanup(pathPrefix);
    }
    getProxyCacheMetrics() {
        return this.proxyCacheManager.metricsSnapshot();
    }
    resetProxyCache() {
        this.proxyCacheManager.reset();
    }
    recordProxyCacheHit() {
        this.proxyCacheManager.markHit();
    }
    recordProxyCacheMiss() {
        this.proxyCacheManager.markMiss();
    }
    getProxyCacheEntry(path) {
        return this.proxyCacheManager.peek(path);
    }
    setProxyCacheEntry(proxy, path) {
        this.proxyCacheManager.add(path, proxy);
    }
    clearProxyCacheForPath(path) {
        this.proxyCacheManager.delete(path);
    }
    getProxyCacheDump() {
        return this.proxyCacheManager.dump();
    }
    getSignalFromProxyCache(path) {
        return this.proxyCacheManager.getSignal(path);
    }
    setSignalInProxyCache(path, signalRef) {
        this.proxyCacheManager.setSignal(path, signalRef);
    }
    emitProxyMetrics(metrics) {
        this.proxyCacheManager.emitMetrics(metrics);
    }
    setCloneComputedOutputs(enabled) { this.cloneComputedOutputs = !!enabled; }
    getCloneComputedOutputs() { return this.cloneComputedOutputs; }
    // Control BehaviorSubject update propagation on writes
    setBehaviorUpdatesEnabled(enabled) { this.behaviorUpdatesEnabled = !!enabled; }
    getBehaviorUpdatesEnabled() { return this.behaviorUpdatesEnabled; }
    // Emituje statystyki subskrypcji behavior store przez unified emitter
    emitBehaviorSubscriptionStats() {
        const stats = this.behaviorSvc.getSubscriptionStats();
        this.devToolsEmitter.emit(this.storeName, {
            type: 'BEHAVIOR_STORE_UPDATE',
            payload: {
                storeName: this.storeName,
                action: 'update',
                path: 'behavior-subscriptions',
                keys: [],
                ...stats,
                graph: undefined
            }
        });
    }
    // Ręczne emitowanie statystyk (do wywołania z zewnątrz)
    emitBehaviorStats() {
        this.emitBehaviorSubscriptionStats();
    }
    // ------------------
    // Observable cache helpers
    // ------------------
    getCachedObservableMethod(path, method, observable) {
        const normalized = PathUtils.normalizePath(path);
        const key = `${normalized}.${method}`;
        if (!this.observableMethodCache[key]) {
            const obsMethod = observable[method];
            this.observableMethodCache[key] = obsMethod.bind(observable);
        }
        return this.observableMethodCache[key];
    }
    // ------------------
    // Computed operations
    // ------------------
    // Typed wrapper delegating to ComputedService for array query methods
    createArrayQueryComputed(path, method, predicate, ...args) {
        return this.computedSvc.createArrayQueryComputed(path, method, predicate, ...args);
    }
    registerPipelineComputed(path, signalRef) {
        this.computedSvc.registerPipelineComputed(path, signalRef);
    }
    addToComputeStore(path) {
        this.computedSvc.add(path);
    }
    deleteFromComputeStore(path) {
        this.computedSvc.remove(path);
    }
    getComputed(path) {
        return this.computedSvc.get(path);
    }
    // ------------------
    // Behavior operations
    // ------------------
    addToBehaviorStoreIfExists(path) {
        this._behaviorSvc?.getIfExists(path);
    }
    getObservableIfExists(path) {
        const subject = this._behaviorSvc?.getIfExists(path);
        return subject ? subject.asObservable() : undefined;
    }
    addToBehaviorStore(path) {
        this.behaviorSvc.add(path);
    }
    // Subscriptions are tracked inside BehaviorService via a tracked Observable wrapper.
    addBehaviorSubscription(path) {
        return this.behaviorSvc.getTrackedObservable(path);
    }
    removeBehaviorSubscription(_path) {
        // No-op: unsubscribe tracking handled by BehaviorService.
    }
    hasActiveSubscriptions(path) {
        return this._behaviorSvc?.hasActiveSubscriptions(path) ?? false;
    }
    getSubscriptionCount(path) {
        return this._behaviorSvc?.getSubscriptionCount(path) ?? 0;
    }
    // Pobierz observable z pipe i automatycznie śledź subskrypcje
    getObservableWithPipe(path, pipeFn) {
        const observable = this.behaviorSvc.getTrackedObservable(path);
        return pipeFn ? pipeFn(observable) : observable;
    }
    getObservable(path) {
        return this.behaviorSvc.get(path);
    }
    getTrackedObservable(path) {
        return this.behaviorSvc.getTrackedObservable(path);
    }
    // Refresh existing BehaviorSubjects under a prefix (incl. nested paths)
    updateBehaviorByPrefix(pathPrefix, options) {
        if (!this.behaviorUpdatesEnabled)
            return;
        if (!pathPrefix || typeof pathPrefix !== 'string')
            return;
        this._behaviorSvc?.updateByPrefix(pathPrefix, options);
    }
    updateDescendantBehaviorsByPrefix(pathPrefix) {
        if (!this.behaviorUpdatesEnabled)
            return;
        if (!pathPrefix || typeof pathPrefix !== 'string')
            return;
        this._behaviorSvc?.updateDescendantsByPrefix(pathPrefix);
    }
    syncDescendantsAfterBranchMutation(pathPrefix) {
        if (!pathPrefix || typeof pathPrefix !== 'string')
            return;
        this.reactivityWakeup.wakeUpBranch(pathPrefix);
    }
    // ------------------
    // Helper methods for checking and managing stores
    // ------------------
    isBehaviorExists(path) {
        return this._behaviorSvc?.isExists(path) ?? false;
    }
    isComputedExists(path) {
        return this.computedSvc.isExists(path);
    }
    deleteBehavior(path) {
        this.behaviorSvc.delete(path);
    }
    deleteComputed(path) {
        this.deleteFromComputeStore(path);
    }
    // Removed: getBehaviorKeys() - moved to DevService
    // Removed: getComputedKeys() - moved to DevService
    getBehaviorStore() {
        return this._behaviorSvc?.store() ?? {};
    }
    getComputedStore() {
        return this.computedSvc.store();
    }
    cleanupBehaviorStore(pathPrefix) {
        this._behaviorSvc?.cleanup(pathPrefix);
    }
    // Wyczyść nieaktywne węzły (bez subskrypcji)
    cleanupInactiveBehaviorNodes(pathPrefix) {
        this._behaviorSvc?.cleanupInactive(pathPrefix);
    }
    // removed tree walk cleanup
    cleanupComputedStore(pathPrefix) {
        this.computedSvc.cleanup(pathPrefix);
    }
    destroy() {
        this.stopCollect();
        this._behaviorSvc?.destroy();
        this._computedSvc?.cleanup();
        this._versionSvc?.cleanup();
        this.versionBumpCoordinator.destroy();
        this.proxyCacheManager.reset();
        this.clearPathSegmentCache('');
        this.observableMethodCache = Object.create(null);
        this._storeProxy = undefined;
        this.usingComputedStoreFallback = false;
    }
    // ------------------
    // Version operations
    // ------------------
    getVersion(path) {
        const v = this.versionSvc.get(path);
        this.registerRead(PathUtils.normalizePath(path));
        return v;
    }
    bumpVersionsFor(path) {
        this.versionBumpCoordinator.bumpPath(path);
    }
    bumpVersionsForNormalized(normalized) {
        this.versionBumpCoordinator.bumpPathNormalized(normalized);
    }
    bumpDescendantVersionsFor(pathPrefix) {
        this.versionBumpCoordinator.bumpDescendants(pathPrefix);
    }
    bumpDescendantVersionsForNormalized(normalizedPrefix) {
        this.versionBumpCoordinator.bumpDescendantsNormalized(normalizedPrefix);
    }
    cleanupVersionStore(pathPrefix) {
        this._versionSvc?.cleanup(pathPrefix);
    }
    /** @deprecated Kept for compatibility; use normal mutation wake-up paths instead. */
    bumpVersionsFromPatches(patches) {
        this.versionBumpCoordinator.bumpFromPatches(patches);
    }
    // Version graph/keys helpers for DevTools
    getVersionKeys() { return this._versionSvc?.keys() ?? []; }
    // Removed: getBehaviorSubscriptionStats() - moved to DevService
    // ------------------
    // Helper methods
    // ------------------
    // Update existing version node without creating new ones; emit DevTools 'update'
    updateVersionIfExists(path) { this._versionSvc?.updateIfExists(path); }
    hasIndexedPathFromKeys(keys, path, startIndex) {
        if (!keys.length)
            return false;
        const normalized = PathUtils.normalizePath(path);
        const prefix = normalized ? `${normalized}.` : '';
        if (!prefix)
            return false;
        for (const key of keys) {
            if (!key.startsWith(prefix))
                continue;
            const dotIndex = key.indexOf('.', prefix.length);
            const segment = dotIndex === -1 ? key.slice(prefix.length) : key.slice(prefix.length, dotIndex);
            const index = Number(segment);
            if (Number.isInteger(index) && index >= startIndex)
                return true;
        }
        return false;
    }
    // ===== Auto-tracked multi-path computed =====
    createAutoTrackedComputed(pathKey, derive) {
        return this.computedSvc.createAutoTrackedComputed(pathKey, derive);
    }
    getAutoComputed(pathKey) {
        return this.computedSvc.getAutoComputed(pathKey);
    }
    deleteAutoComputed(pathKey) {
        this.computedSvc.deleteAutoComputed(pathKey);
    }
}

// src/app/store/types/type-guards.ts
/**
 * Type guard to validate store instance
 */
function isValidStoreInstance(instance) {
    return (instance !== null &&
        instance !== undefined &&
        typeof instance === 'object' &&
        'store' in instance &&
        typeof instance['store'] === 'object' &&
        instance['store'] !== null &&
        'readStore' in instance &&
        typeof instance['readStore'] === 'function');
}
/**
 * Type guard to validate if store instance matches specific type constraint
 */
function isStoreInstanceOfType(instance) {
    try {
        const storeValue = instance.store;
        return storeValue !== null &&
            typeof storeValue === 'object' &&
            !Array.isArray(storeValue);
    }
    catch {
        return false;
    }
}
/**
 * Walidacja formatu ścieżki – deleguje do PathUtils.isValidPath (SSOT).
 */
function isValidPath(path) {
    return PathUtils.isValidPath(path);
}
/**
 * Type guard to check if path points to an array
 */
function isArrayPath(storeInstance, path) {
    // Najpierw walidacja formatu ścieżki (SSOT), istnienie może być false
    if (!isValidPath(path)) {
        return false;
    }
    try {
        const value = storeInstance.readStore(path);
        return Array.isArray(value);
    }
    catch {
        return false;
    }
}
/**
 * Type guard to check if value is a valid store data object
 */
function isStoreData(value) {
    return (value !== null &&
        value !== undefined &&
        typeof value === 'object' &&
        !Array.isArray(value));
}
/**
 * Type guard to check if path exists in store
 */
function pathExists(storeInstance, path) {
    // Najpierw walidacja formatu ścieżki (SSOT)
    if (!isValidPath(path)) {
        return false;
    }
    try {
        const value = storeInstance.readStore(path);
        return value !== undefined;
    }
    catch {
        return false;
    }
}
/**
 * Type guard for array mutation methods
 */
function isArrayMutationMethod(method) {
    return ['push', 'pop', 'shift', 'unshift', 'splice', 'reverse', 'sort'].includes(method);
}
/**
 * Type guard for array query methods
 */
function isArrayQueryMethod(method) {
    return ['find', 'findIndex', 'filter', 'map', 'reduce', 'some', 'every', 'includes', 'indexOf'].includes(method);
}
/**
 * Enhanced type guard that combines path validation and value existence
 */
function isValidStorePath(storeInstance, path) {
    return isValidPath(path) && pathExists(storeInstance, path);
}
/**
 * Type predicate for safe path value access
 */
function hasPathValue(storeInstance, path) {
    try {
        const value = storeInstance.readStore(path);
        return value !== undefined && value !== null;
    }
    catch {
        return false;
    }
}

class CreateStore {
    signalStore;
    storeName;
    store = {};
    // Gettery do service dla interfejsu
    get computedStore() {
        return this.createService.getComputedStore();
    }
    get behaviorStore() {
        return this.createService.getBehaviorStore();
    }
    // Single getter for createService (used by proxy handler, TypedArrayOperations, and external consumers)
    get createServiceGetter() {
        return this.createService;
    }
    // Alias for backward compatibility (deprecated: use createServiceGetter)
    get getCreateService() {
        return this.createServiceGetter;
    }
    arrayOpsCache = Object.create(null);
    // Per-call factory for array operations bound to a specific path
    arrayOps(path) {
        const normalizedPath = PathUtils.normalizePath(path);
        const cached = this.arrayOpsCache[normalizedPath];
        if (cached)
            return cached;
        const ops = new TypedArrayOperations(this.signalStore, this.storeName, normalizedPath);
        this.arrayOpsCache[normalizedPath] = ops;
        return ops;
    }
    // Fluent API entrypoint: chainable array operations
    array(path) {
        return new ArrayChain(this.arrayOps(path));
    }
    devService;
    createService;
    _cursor;
    get cursor() { return this._cursor ??= new CursorManager(); }
    emitStoreUpdate(type, payload) {
        this.emitDevAction({
            type,
            payload: {
                storeName: this.storeName,
                ...payload,
                graph: undefined
            }
        });
    }
    snapshotForDevtools(value) {
        if (value === undefined || value === null)
            return value;
        try {
            return structuredClone(value);
        }
        catch {
            try {
                return JSON.parse(JSON.stringify(value));
            }
            catch {
                return value;
            }
        }
    }
    emitDevtoolsEvent(normalizedPath, value, oldValue) {
        this.emitStoreUpdate('SET_VALUE_OBSERVE', {
            path: normalizedPath,
            value: this.snapshotForDevtools(value),
            oldValue: this.snapshotForDevtools(oldValue)
        });
    }
    computedKeys() {
        return this.devService ? this.devService.getComputedKeys(this.createService.getComputedStore()) : Object.keys(this.computedStore);
    }
    behaviorKeys() {
        return this.devService ? this.devService.getBehaviorKeys(this.createService.getBehaviorStore()) : [];
    }
    emitComputedEvent(action, path) {
        this.emitStoreUpdate('COMPUTED_STORE_UPDATE', {
            action,
            path,
            keys: this.computedKeys(),
            snapshot: this.getComputedSnapshot()
        });
    }
    emitBehaviorEvent(path, action, value, currentState) {
        this.emitStoreUpdate('BEHAVIOR_STORE_UPDATE', {
            action,
            path,
            keys: this.behaviorKeys(),
            value,
            currentState
        });
    }
    withValidatedPath(path, context, action) {
        return action(this.validateAndGet(path, context));
    }
    withReactiveAccessor(path, context, exists, read, emitAdd) {
        return this.withValidatedPath(path, context, (normalizedPath) => {
            const existed = exists(normalizedPath);
            const value = read(normalizedPath);
            if (!existed && exists(normalizedPath)) {
                emitAdd(normalizedPath);
            }
            return value;
        });
    }
    cleanupDerivedPath(normalizedPath) {
        this.createService.cleanupBehaviorStore(normalizedPath);
        this.createService.cleanupComputedStore(normalizedPath);
        this.createService.cleanupVersionStore(normalizedPath);
        this.createService.clearProxyCacheForPath(normalizedPath);
        this.cursor.invalidateCache(normalizedPath);
        this.cursor.invalidateForDeletion(normalizedPath);
    }
    queueDerivedCleanup(normalizedPath) {
        queueMicrotask(() => this.cleanupDerivedPath(normalizedPath));
    }
    emitBehaviorUpdateIfTracked(normalizedPath, behaviorsEnabled, emitBehaviorUpdate, behaviorValue, behaviorState) {
        if (behaviorsEnabled && emitBehaviorUpdate && this.createService.isBehaviorExists(normalizedPath)) {
            this.emitBehaviorEvent(normalizedPath, 'update', behaviorValue, behaviorState);
        }
    }
    isBranchValue(value) {
        return PathUtils.isBranchValue(value);
    }
    mutateStoreNormalized(normalizedPath, value, options = {}) {
        const { ensureBehavior = false, emitBehaviorUpdate = false, cleanupOnUndefined = false, emitDevtools = false, behaviorValue, behaviorState } = options;
        let previousValue;
        let shouldDeleteNode = false;
        const plan = this.cursor.applyPathPlan(normalizedPath);
        previousValue = this.cursor.mutateNode(this.store, plan, normalizedPath, value);
        shouldDeleteNode = cleanupOnUndefined && value === undefined;
        if (shouldDeleteNode) {
            this.deletePathFromStore(normalizedPath);
        }
        const behaviorsEnabled = this.createService.wakeUpMutationPathNormalized(normalizedPath, value, {
            ensureBehavior,
            syncDescendants: this.isBranchValue(previousValue) || this.isBranchValue(value)
        });
        if (emitDevtools && this.signalStore.devActive) {
            this.emitDevtoolsEvent(normalizedPath, value, previousValue);
        }
        this.emitBehaviorUpdateIfTracked(normalizedPath, behaviorsEnabled, emitBehaviorUpdate, behaviorValue, behaviorState);
        if (shouldDeleteNode) {
            this.queueDerivedCleanup(normalizedPath);
        }
    }
    // numeric segment helper removed; use PathUtils/isNumericSegment (SSOT) where needed
    constructor(signalStore, storeName, _proxyFactory, devService) {
        this.signalStore = signalStore;
        this.storeName = storeName;
        this.devService = devService;
        // Initialize CreateStoreService for this instance
        this.createService = new CreateStoreService(storeName, signalStore);
        // Validate initial store name
        if (!storeName || typeof storeName !== 'string') {
            throw StoreErrorFactory.pathValidation(storeName, 'Store name must be a non-empty string');
        }
        // Default: sync version bumps for JSON-like read-after-write behavior
        this.createService.setAutoBatchBumps(false);
        // Self-register so getStore(storeName) resolves instances built directly via
        // `new CreateStore(...)` (e.g. tests / advanced usage), not only via the createStore
        // factory. The factory re-registers the same instance afterwards — idempotent.
        this.signalStore.registerStoreInstance(storeName, this);
    }
    // Removed: getDevTools() - DevService now injected via constructor
    // Helper method to emit DevTools actions consistently
    emitDevAction(action) {
        if (this.signalStore.devActive) {
            this.signalStore.emitDevAction(this.storeName, action);
        }
    }
    getComputedSnapshot() {
        const snapshot = {};
        Object.keys(this.computedStore).forEach(k => {
            try {
                const s = this.computedStore[k];
                snapshot[k] = s();
            }
            catch {
                snapshot[k] = '[signal]';
            }
        });
        return snapshot;
    }
    addToComputeStore(path) {
        this.createService.addToComputeStore(path);
        this.emitComputedEvent('add', path);
    }
    deleteFromComputeStore(path) {
        this.createService.deleteFromComputeStore(path);
        this.emitComputedEvent('remove', path);
    }
    returnStore() {
        return this.store;
    }
    setValue(path, value) {
        // Type-safe setValue with runtime validation
        if (isValidPath(path)) {
            try {
                this.setValueObserve(path, value);
            }
            catch (error) {
                throw StoreErrorFactory.pathAccess(path, 'setValue', error);
            }
        }
        else {
            throw StoreErrorFactory.pathValidation(path, 'Invalid path format for setValue');
        }
    }
    // Implementation
    setArrayMethod(path, a, method, ...args) {
        const ops = this.arrayOps(path);
        if (typeof a === 'string' && (a === 'pop' || a === 'shift')) {
            // form: setArrayMethod(path, 'pop' | 'shift')
            return ops.setArrayMethod(undefined, a);
        }
        return ops.setArrayMethod(a, method, ...args);
    }
    setArrayMethodRef(path, arrayRef, val, method, ...args) {
        return this.arrayOps(path).setArrayMethodOnRef(arrayRef, val, method, ...args);
    }
    // Fallback implementation signature
    queryArray(path, val, method, ...args) {
        const ops = this.arrayOps(path);
        // Delegate to TypedArrayOperations; casting kept to unknown to avoid any
        return ops.queryArray(val, method, ...args);
    }
    deleteFromArray(path, predicate) {
        return this.arrayOps(path).deleteFromArray(predicate);
    }
    deleteByIndex(path, index) {
        return this.arrayOps(path).deleteByIndex(index);
    }
    deleteValue(path) {
        try {
            if (!PathUtils.isValidPath(path)) {
                throw StoreErrorFactory.pathValidation(path, 'Invalid path format for delete operation');
            }
            // Set value to undefined (removes from store)
            this.setValue(path, undefined);
        }
        catch (error) {
            throw StoreErrorFactory.pathAccess(path, 'deleteValue', error);
        }
    }
    cleanupPath(path) {
        const normalizedPath = PathUtils.normalizePath(path);
        if (!normalizedPath) {
            return;
        }
        this.cleanupDerivedPath(normalizedPath);
    }
    destroy() {
        this.createService.destroy();
        this.cursor.clearCaches();
        for (const path of Object.keys(this.arrayOpsCache))
            delete this.arrayOpsCache[path];
    }
    // Type-safe array query methods - all delegate to TypedArrayOperations via arrayOps()
    findInArray(path, predicate) { return this.arrayOps(path).findInArray(predicate); }
    findIndexInArray(path, predicate) { return this.arrayOps(path).findIndexInArray(predicate); }
    filterArray(path, predicate) { return this.arrayOps(path).filterArray(predicate); }
    mapArray(path, callback) { return this.arrayOps(path).mapArray(callback); }
    reduceArray(path, callback, initialValue) { return this.arrayOps(path).reduceArray(callback, initialValue); }
    someArray(path, predicate) { return this.arrayOps(path).someArray(predicate); }
    everyArray(path, predicate) { return this.arrayOps(path).everyArray(predicate); }
    includesInArray(path, searchElement) { return this.arrayOps(path).includesInArray(searchElement); }
    indexOfInArray(path, searchElement) { return this.arrayOps(path).indexOfInArray(searchElement); }
    lengthOfArray(path) {
        return this.arrayOps(path).lengthOfArray();
    }
    // Type-safe array modification methods - delegate to TypedArrayOperations
    updateArrayItem(path, index, newValue) { return this.arrayOps(path).updateArrayItem(index, newValue); }
    updateArrayItemByFind(path, predicate, newValue) { return this.arrayOps(path).updateArrayItemByFind(predicate, newValue); }
    getComputed(path) {
        return this.withReactiveAccessor(path, 'computed signal', (normalized) => this.createService.isComputedExists(normalized), (normalized) => this.createService.getComputed(normalized), (normalized) => this.emitComputedEvent('add', normalized));
    }
    getSignalValue(path) {
        return PathUtils.isValidPath(path) ? this.signalStore.getSignalValue(this.storeName, path) : undefined;
    }
    readStore(path) {
        return path && typeof path === 'string' ? this.signalStore.readStore(this.storeName, path) : undefined;
    }
    getBehaviorSubject(path) {
        return this.withReactiveAccessor(path, 'BehaviorSubject', (normalized) => this.createService.isBehaviorExists(normalized), (normalized) => this.createService.getObservable(normalized), (normalized) => this.emitBehaviorEvent(normalized, 'add', undefined, this.createService.getBehaviorStore()));
    }
    getObservable(path) {
        return this.withValidatedPath(path, 'Observable', (normalizedPath) => this.createService.getObservable(normalizedPath));
    }
    // Helper methods
    validateAndGet(path, context) {
        if (!PathUtils.isValidPath(path)) {
            throw StoreErrorFactory.pathValidation(path, `Invalid path format for ${context}`);
        }
        return PathUtils.normalizePath(path);
    }
    // New: type-safe selection APIs delegating to service
    select(project) {
        // createService is generic on T, so pass through
        return this.createService.select(project);
    }
    computedOf(project) {
        return this.createService.computedOf(project);
    }
    setValueObserve(path, value) {
        try {
            this.withValidatedPath(path, 'observe operation', (normalizedPath) => {
                this.mutateStoreNormalized(normalizedPath, value, {
                    ensureBehavior: true,
                    emitBehaviorUpdate: true,
                    cleanupOnUndefined: true,
                    emitDevtools: true
                });
            });
        }
        catch (error) {
            throw StoreErrorFactory.pathAccess(path, 'setValueObserve', error);
        }
    }
    updateBehaviorsBySegments(path, newValue) {
        this.createService.updateBehaviorsBySegments(path, newValue);
        // DevTools: emit update event for the normalized path if a BehaviorSubject exists
        const normalized = PathUtils.normalizePath(path);
        if (this.createService.isBehaviorExists(normalized)) {
            this.emitBehaviorEvent(normalized, 'update', this.readStore(normalized), this.createService.getBehaviorStore());
        }
    }
    wakeUpArrayMutation(path, value, afterVersion) {
        const normalized = PathUtils.normalizePath(path);
        this.createService.wakeUpArrayMutation(normalized, value, afterVersion, (p, v) => this.updateBehaviorsBySegments(p, v));
    }
    wakeUpMutationPath(path, value, options) {
        const normalized = PathUtils.normalizePath(path);
        return this.createService.wakeUpMutationPath(normalized, value, options, (p, v) => this.updateBehaviorsBySegments(p, v));
    }
    wakeUpVersionPath(path) {
        this.createService.wakeUpVersionPath(path);
    }
    wakeup(path, mode = 'leaf') {
        this.withValidatedPath(path, 'wakeup', (normalizedPath) => {
            this.createService.wakeUpVersionPathWithMode(normalizedPath, mode);
        });
    }
    wakeUp(path, mode = 'leaf') {
        this.wakeup(path, mode);
    }
    batch(fn) {
        const previousAutoBatch = this.createService.getAutoBatchBumps();
        this.createService.setAutoBatchBumps(true);
        this.createService.beginAction();
        try {
            return fn();
        }
        finally {
            this.createService.endAction();
            this.createService.flushPendingBumps();
            this.createService.setAutoBatchBumps(previousAutoBatch);
        }
    }
    enableDevTools(_storeName, showVisualizer = true) {
        // Visualizer handled globally; nothing to do here
        if (showVisualizer && typeof document !== 'undefined') {
            const existing = document.querySelector('app-dev-tools');
            if (!existing) {
                const comp = document.createElement('app-dev-tools');
                document.body.appendChild(comp);
            }
        }
    }
    // Convenience to configure dependency mode per store instance
    setDependencyMode(mode) {
        this.createService.setDependencyMode(mode);
    }
    // Toggle read-tracking (collector) for auto-computed derivations
    setTrackReads(enabled) {
        this.createService.setTrackReads(enabled);
    }
    // Control shallow-clone of computed outputs (objects/arrays)
    setCloneComputedOutputs(enabled) {
        this.createService.setCloneComputedOutputs(enabled);
    }
    // Toggle BehaviorSubject updates
    setBehaviorUpdatesEnabled(enabled) {
        this.createService.setBehaviorUpdatesEnabled(enabled);
    }
    // Prefetch cursor during proxy navigation to narrow subsequent sets
    prefetchCursorWithNode(path, node) {
        try {
            this.cursor.prefetch(path, node);
        }
        catch (e) {
            console.warn('CreateStore prefetchCursor error:', e);
        }
    }
    // Fast setter used by proxy: assumes path is normalized ('a.b.c'), skips validation/normalize
    setValueFast(path, value) {
        this.mutateStoreNormalized(path, value, { emitDevtools: true });
    }
    // Opt-in fine-grained mutate wake (default false = historical behaviour). Mirrors
    // SolidStoreOptions.preciseMutationWake so both engines behave identically.
    preciseMutationWake = false;
    setPreciseMutationWake(enabled) {
        this.preciseMutationWake = enabled;
    }
    // Fine-grained mutate commit (opt-in): write the new branch value, then wake ONLY the
    // changed leaves + the branch itself (no syncDescendants). The branch wake keeps
    // whole-array consumers correct; leaf wakes refresh the changed fields. Branch interest
    // (liveQuery-equivalent) still fires via its own version bump. Analogous to
    // SolidStore.#commitPrecise; paths come from the shared mutation pass itself.
    commitMutationPrecise(branch, value, relPaths) {
        const normalizedBranch = PathUtils.normalizePath(branch);
        this.batch(() => {
            const plan = this.cursor.applyPathPlan(normalizedBranch);
            this.cursor.mutateNode(this.store, plan, normalizedBranch, value);
            // Branch signal (whole-array consumers) without descendants.
            this.wakeUpMutationPath(normalizedBranch, value, { syncDescendants: false });
            // Exact changed leaves without descendants.
            for (const rel of relPaths) {
                const leaf = `${normalizedBranch}.${rel}`;
                this.wakeUpMutationPath(leaf, this.readStore(leaf), { syncDescendants: false });
            }
        });
    }
    deletePathFromStore(normalizedPath) {
        const segments = normalizedPath.split('.');
        if (segments.length === 0) {
            return;
        }
        const lastSegment = segments.pop();
        let parent = this.store;
        for (const segment of segments) {
            if (parent == null || typeof parent !== 'object') {
                return;
            }
            parent = parent[segment];
        }
        if (parent == null || typeof parent !== 'object') {
            return;
        }
        if (Array.isArray(parent)) {
            const index = Number(lastSegment);
            if (!Number.isNaN(index) && index >= 0 && index < parent.length) {
                parent.splice(index, 1);
            }
            return;
        }
        {
            delete parent[lastSegment];
        }
    }
}

// Allowed RxJS methods exposed via proxy
const ALLOWED_METHODS = ['pipe', 'subscribe', 'toPromise', 'forEach'];
class RxJSBindingUtils {
    createStoreService;
    constructor(createStoreService) {
        this.createStoreService = createStoreService;
    }
    // Lokalny cache metod, aby zwracane referencje były stabilne per path+method
    // Przechowujemy różne kształty funkcji, ale wystarczy ogólny Function
    methodCache = new Map();
    methodFactories = {
        subscribe: (path, cacheKey) => this.createSubscribeMethod(path, cacheKey),
        pipe: (path, cacheKey) => this.createPipeMethod(path, cacheKey),
        toPromise: (path, cacheKey) => this.createObservableMethod(path, 'toPromise', cacheKey),
        forEach: (path, cacheKey) => this.createObservableMethod(path, 'forEach', cacheKey)
    };
    getTrackedObservable(path) {
        return this.createStoreService.getTrackedObservable(path);
    }
    // Implementation signature (single implementation for all overloads)
    getRxJSMethod(path, method) {
        const factory = this.methodFactories[method];
        if (!factory) {
            throw new Error(`Method ${method} is not a supported RxJS Observable method.`);
        }
        const cacheKey = `${path}|${method}`;
        const cached = this.methodCache.get(cacheKey);
        if (cached)
            return cached;
        return factory(path, cacheKey);
    }
    createSubscribeMethod(path, cacheKey) {
        const wrappedSubscribe = (...args) => {
            const observable = this.getTrackedObservable(path);
            return observable.subscribe(...args);
        };
        this.methodCache.set(cacheKey, wrappedSubscribe);
        return wrappedSubscribe;
    }
    createPipeMethod(path, cacheKey) {
        const wrappedPipe = (...operators) => {
            return this.createStoreService.getObservableWithPipe(path, (obs) => {
                return operators.reduce((acc, op) => acc.pipe(op), obs);
            });
        };
        this.methodCache.set(cacheKey, wrappedPipe);
        return wrappedPipe;
    }
    createObservableMethod(path, method, cacheKey) {
        const observable = this.getTrackedObservable(path);
        const fn = this.createStoreService.getCachedObservableMethod(path, method, observable);
        this.methodCache.set(cacheKey, fn);
        return fn;
    }
}

class ArrayMethodHandler {
    static EMPTY_ARGS = [];
    static mutationArgNormalizers = {
        splice: (args) => ArrayMethodHandler.normalizeSpliceArgs(args),
        push: (args) => ArrayMethodHandler.normalizeVariadicArgs(args),
        unshift: (args) => ArrayMethodHandler.normalizeVariadicArgs(args),
        sort: (args) => ArrayMethodHandler.normalizeSingleArg(args),
        pop: () => ArrayMethodHandler.normalizeNoArgs(),
        shift: () => ArrayMethodHandler.normalizeNoArgs(),
        reverse: () => ArrayMethodHandler.normalizeNoArgs()
    };
    static normalizeMutationArgs(keyStr, args) {
        return ArrayMethodHandler.mutationArgNormalizers[keyStr](args);
    }
    static normalizeSpliceArgs(args) {
        const [start, deleteCount, ...items] = args;
        return { value: { start, deleteCount: args.length > 1 ? deleteCount : undefined, items }, extra: [] };
    }
    static normalizeVariadicArgs(args) {
        return args.length <= 1
            ? { value: args[0], extra: ArrayMethodHandler.EMPTY_ARGS }
            : { value: args[0], extra: args.slice(1) };
    }
    static normalizeSingleArg(args) {
        return { value: args[0], extra: ArrayMethodHandler.EMPTY_ARGS };
    }
    static normalizeNoArgs() {
        return { value: undefined, extra: ArrayMethodHandler.EMPTY_ARGS };
    }
    static createMutatingMethod(keyStr, targetPath, storeInstance, afterMutation, arrayRef) {
        return function (...args) {
            const calledAsMethod = this !== undefined && this !== globalThis;
            return ArrayMethodHandler.executeMutatingMethod(keyStr, targetPath, storeInstance, args, afterMutation, calledAsMethod ? arrayRef : undefined);
        };
    }
    static executeMutatingMethod(keyStr, targetPath, storeInstance, args, afterMutation, arrayRef) {
        if ((keyStr === 'push' || keyStr === 'unshift') && args.length === 0) {
            const current = arrayRef ?? storeInstance.readStore?.(targetPath);
            return (Array.isArray(current) ? current.length : undefined);
        }
        const { value, extra } = ArrayMethodHandler.normalizeMutationArgs(keyStr, args);
        let result;
        const fastStore = storeInstance;
        if (arrayRef && fastStore.setArrayMethodRef) {
            result = fastStore.setArrayMethodRef(targetPath, arrayRef, value, keyStr, ...extra);
        }
        else if (ArrayMethodHandler.isValidArrayPath(storeInstance, targetPath)) {
            result = storeInstance.setArrayMethod(targetPath, value, keyStr, ...extra);
        }
        afterMutation?.();
        return result;
    }
    static createQueryMethod(keyStr, targetPath, storeInstance, cache) {
        return (...args) => {
            const firstArg = args[0];
            if (!ArrayMethodHandler.isValidArrayPath(storeInstance, targetPath)) {
                return undefined;
            }
            // Build a stable cache key using shared util
            const cacheKey = buildArrayQueryCacheKey(targetPath, keyStr, firstArg, args.slice(1));
            if (cache) {
                const ref = cache[cacheKey];
                const cached = ref?.deref?.();
                if (cached) {
                    return cached;
                }
            }
            // Prefer createService-based computed (reactive), which is memoized under path
            const createService = storeInstance.getCreateService;
            let result;
            if (createService && typeof createService.createArrayQueryComputed === 'function') {
                result = createService.createArrayQueryComputed(targetPath, keyStr, firstArg, ...args.slice(1));
            }
            else {
                // Fallback: non-reactive query
                result = storeInstance.queryArray(targetPath, firstArg, keyStr, ...args.slice(1));
            }
            if (cache && result !== undefined) {
                try {
                    cache[cacheKey] = new WeakRef(result);
                }
                catch {
                    // ignore environments without WeakRef support
                }
            }
            return result;
        };
    }
    /**
     * Type guard to validate array paths
     */
    static isValidArrayPath(storeInstance, path) {
        return isArrayPath(storeInstance, path);
    }
}

class BaseProxyHandler {
    static UNHANDLED = Symbol('proxy-handler-unhandled');
    storeInstance;
    rxjsBindingUtils;
    constructor(storeInstance) {
        this.storeInstance = storeInstance;
        const deps = storeInstance;
        this.rxjsBindingUtils = new RxJSBindingUtils(deps.createService);
    }
    // Wspólna logika sprawdzania symboli
    isSymbolKey(key) {
        return typeof key === 'symbol';
    }
    // Wspólna logika konwersji klucza
    keyToString(key) {
        return String(key);
    }
    resolveRxJSPath(_keyStr, path) {
        return path;
    }
    // Wspólna logika RxJS methods
    handleRxJSMethods(keyStr, path) {
        if (keyStr !== 'pipe' && keyStr !== 'subscribe') {
            return null;
        }
        const resolvedPath = this.resolveRxJSPath(keyStr, path);
        if (!resolvedPath) {
            return null;
        }
        return keyStr === 'pipe'
            ? this.rxjsBindingUtils.getRxJSMethod(resolvedPath, 'pipe')
            : this.rxjsBindingUtils.getRxJSMethod(resolvedPath, 'subscribe');
    }
    getArrayMethodPath(path) {
        return path;
    }
    getArrayMethodCandidate(value) {
        return value;
    }
    getPropertyCache() {
        return undefined;
    }
    getArrayMutationCleanup(nestedCache) {
        if (!nestedCache)
            return undefined;
        return () => {
            for (const key in nestedCache)
                delete nestedCache[key];
        };
    }
    getArrayQueryCache(nestedCache) {
        return nestedCache;
    }
    getArrayMutationMethodCache(_nestedCache) {
        return undefined;
    }
    // Wspólna logika array methods
    handleArrayMethods(keyStr, path, value, nestedCache) {
        const kind = BaseProxyHandler.classifyArrayProxyMethod(keyStr);
        if (kind === null)
            return null;
        const targetPath = this.getArrayMethodPath(path);
        let candidate = this.getArrayMethodCandidate(value);
        if (!Array.isArray(candidate)) {
            candidate = this.resolveValue(targetPath);
        }
        if (!Array.isArray(candidate)) {
            return null;
        }
        const context = { targetPath, candidate, nestedCache };
        if (kind === 'mutation')
            return this.getOrCreateArrayMutationMethod(keyStr, context);
        if (kind === 'query')
            return this.createArrayQueryMethod(keyStr, context);
        return this.resolveArrayLength(context);
    }
    // Single source of truth for proxy-exposed array members; the kind drives dispatch
    // in handleArrayMethods, so the casts there are guaranteed by this classifier.
    static classifyArrayProxyMethod(keyStr) {
        switch (keyStr) {
            case 'push':
            case 'pop':
            case 'shift':
            case 'unshift':
            case 'splice':
            case 'reverse':
            case 'sort':
                return 'mutation';
            case 'find':
            case 'findIndex':
            case 'filter':
            case 'map':
            case 'reduce':
            case 'some':
            case 'every':
            case 'includes':
            case 'indexOf':
                return 'query';
            case 'length':
                return 'length';
            default:
                return null;
        }
    }
    getOrCreateArrayMutationMethod(method, context) {
        const cache = this.getArrayMutationMethodCache(context.nestedCache);
        const cached = cache?.[method];
        if (cached) {
            cached.arrayRef = context.candidate;
            return cached.handler;
        }
        const entry = this.createArrayMutationMethod(method, context);
        if (cache && entry)
            cache[method] = entry;
        return entry?.handler ?? null;
    }
    createArrayMutationMethod(method, context) {
        const targetPath = context.targetPath;
        const cleanup = this.getArrayMutationCleanup(context.nestedCache);
        const storeInstance = this.storeInstance;
        const entry = {
            arrayRef: context.candidate,
            handler: function (...args) {
                const calledAsMethod = this !== undefined && this !== globalThis;
                return ArrayMethodHandler.executeMutatingMethod(method, targetPath, storeInstance, args, cleanup, calledAsMethod ? entry.arrayRef : undefined);
            }
        };
        return entry;
    }
    createArrayQueryMethod(method, context) {
        if (!isArrayPath(this.storeInstance, context.targetPath))
            return null;
        return ArrayMethodHandler.createQueryMethod(method, context.targetPath, this.storeInstance, this.getArrayQueryCache(context.nestedCache));
    }
    resolveArrayLength(context) {
        const createService = this.storeInstance.getCreateService;
        const lengthSignal = createService?.createArrayQueryComputed(context.targetPath, 'length', undefined);
        if (lengthSignal)
            return lengthSignal();
        const actualValue = Array.isArray(context.candidate)
            ? context.candidate
            : this.storeInstance.readStore(context.targetPath);
        return Array.isArray(actualValue) ? actualValue.length : null;
    }
    // Wspólna logika walidacji ścieżek: zawsze deleguj do PathUtils.isValidPath (SSOT)
    isValidPath(path) {
        return PathUtils.isValidPath(path);
    }
    getCachedProperty(_keyStr, _currentPath) {
        return BaseProxyHandler.UNHANDLED;
    }
    cacheResolvedProperty(_keyStr, _currentPath, _currentValue, resolvedValue) {
        return resolvedValue;
    }
    afterSetProperty(_keyStr, _targetPath, _value) { }
    afterDeleteProperty(_keyStr, _targetPath) { }
    resolveHelperProperty(keyStr, currentPath) {
        if (keyStr !== '$val' && keyStr !== '$signal') {
            return BaseProxyHandler.UNHANDLED;
        }
        const basePath = this.resolveHelperBasePath(keyStr, currentPath);
        if (!basePath || !isValidPath(basePath)) {
            return undefined;
        }
        return keyStr === '$val'
            ? this.storeInstance.readStore(basePath)
            : this.storeInstance.getComputed(basePath);
    }
    resolveHelperBasePath(keyStr, currentPath) {
        const suffix = `.${keyStr}`;
        return currentPath.endsWith(suffix) ? currentPath.slice(0, -suffix.length) : '';
    }
    // Wspólny proxy getter pattern
    createProxyGetter(target) {
        return (_, key) => {
            if (this.isSymbolKey(key)) {
                return (key === Symbol.toPrimitive || key === Symbol.toStringTag)
                    ? target[key]
                    : undefined;
            }
            const keyStr = this.keyToString(key);
            let value = this.getCachedProperty(keyStr, '');
            if (value !== BaseProxyHandler.UNHANDLED) {
                return value;
            }
            const currentPath = this.constructPath(keyStr);
            value = this.getCachedProperty(keyStr, currentPath);
            if (value !== BaseProxyHandler.UNHANDLED) {
                return value;
            }
            value = this.resolveHelperProperty(keyStr, currentPath);
            if (value !== BaseProxyHandler.UNHANDLED) {
                return value;
            }
            value = this.handleStoreInstanceMethods(keyStr) ?? BaseProxyHandler.UNHANDLED;
            if (value !== BaseProxyHandler.UNHANDLED) {
                return value;
            }
            value = this.handleRxJSMethods(keyStr, currentPath) ?? BaseProxyHandler.UNHANDLED;
            if (value !== BaseProxyHandler.UNHANDLED) {
                return value;
            }
            value = this.handleArrayMethods(keyStr, currentPath, undefined, this.getPropertyCache()) ?? BaseProxyHandler.UNHANDLED;
            if (value !== BaseProxyHandler.UNHANDLED) {
                return value;
            }
            const currentValue = this.resolveValue(currentPath);
            if (currentValue === undefined) {
                return undefined;
            }
            const resolvedValue = this.createNestedProxy(currentPath, currentValue, keyStr);
            return this.cacheResolvedProperty(keyStr, currentPath, currentValue, resolvedValue);
        };
    }
    // Wspólny proxy setter pattern
    createProxySetter() {
        return (_, key, value) => {
            if (this.isSymbolKey(key)) {
                return false;
            }
            const keyStr = this.keyToString(key);
            const targetPath = this.constructPath(keyStr);
            this.setValue(targetPath, value);
            this.performCleanup();
            this.afterSetProperty(keyStr, targetPath, value);
            return true;
        };
    }
    // Wspólny proxy deleter pattern
    createProxyDeleter() {
        return (_, key) => {
            if (this.isSymbolKey(key)) {
                return false;
            }
            const keyStr = this.keyToString(key);
            const targetPath = this.constructPath(keyStr);
            this.deleteValue(targetPath);
            this.performCleanup();
            this.afterDeleteProperty(keyStr, targetPath);
            return true;
        };
    }
}

class GenericProxyHandler extends BaseProxyHandler {
    options;
    static operatorIds = new WeakMap();
    static nextOperatorId = 0;
    // Per-proxy cache for array query computed signals (WeakRef to allow GC) – flat JSON map
    arrayQueryCache = Object.create(null);
    arrayMutationMethodCache = Object.create(null);
    // Strong nested cache per level to speed up repeated child gets – flat JSON map
    nestedCache = Object.create(null);
    nestedCacheSize = 0;
    reactivePipelineResultHandlers = {
        all: (pipeline) => pipeline.all(),
        first: (pipeline) => {
            const first = pipeline.first();
            return first !== null && first !== undefined ? first : undefined;
        },
        count: (pipeline) => pipeline.count()
    };
    emptyPipelineResultHandlers = {
        all: () => [],
        first: () => undefined,
        count: () => 0
    };
    mutatingPipelineModeHandlers = {
        all: (pipeline) => this.executeMutatingAll(pipeline),
        first: (pipeline) => this.executeMutatingFirst(pipeline),
        count: (pipeline) => this.executeMutatingCount(pipeline)
    };
    mutatingPipelineResponseHandlers = {
        all: (context) => this.toPipelineExecutionResult(context),
        first: (context) => this.toPipelineExecutionResult(context),
        count: (context) => this.toPipelineCountResult(context)
    };
    constructor(storeInstance, options) {
        super(storeInstance);
        this.options = options;
    }
    /**
     * Detects if operators contain mutation operations (update, delete, insert, move, copy, etc.)
     * OPTIMIZED: Uses typed metadata flag instead of slow toString() + string.includes()
     */
    hasMutationOperators(operators) {
        return operators.some(op => op.__isMutation === true);
    }
    getOperatorCacheSegment(operator) {
        const metadataKey = operator.__cacheKey;
        if (metadataKey) {
            return String(metadataKey);
        }
        const fn = operator;
        let id = GenericProxyHandler.operatorIds.get(fn);
        if (id === undefined) {
            id = ++GenericProxyHandler.nextOperatorId;
            GenericProxyHandler.operatorIds.set(fn, id);
        }
        return `fn:${id}`;
    }
    clearNestedCache() {
        for (const key in this.nestedCache) {
            delete this.nestedCache[key];
        }
        this.nestedCacheSize = 0;
    }
    deleteNestedCacheKey(key) {
        if (Object.prototype.hasOwnProperty.call(this.nestedCache, key)) {
            delete this.nestedCache[key];
            this.nestedCacheSize--;
        }
    }
    clonePipelineInput(value) {
        // Same JSON-like clone contract as the rest of jsnq (pipeline autoClone, SolidStore).
        return cloneJsonData(value);
    }
    shouldTrackPipelineOperations() {
        const service = this.storeInstance.createServiceGetter;
        return service?.signalStore?.devActive === true;
    }
    /**
     * Smart pipeline builder that auto-detects mutations and routes to mutate or reactive pipeline
     */
    createSmartPipelineBuilder(pathPrefix) {
        return (...operators) => {
            const builder = this.hasMutationOperators(operators)
                ? this.createMutatingPipelineBuilder(pathPrefix)
                : this.createReactivePipelineBuilder(pathPrefix);
            return builder(...operators);
        };
    }
    /**
     * Creates immediate execution pipeline method that auto-clones data and updates store.
     * Usage: this.menuStore.allItems.mutate(where(...), update(...))
     */
    createMutateMethod() {
        return (...operators) => {
            const fast = this.tryFastMutate(operators);
            if (fast)
                return fast.value;
            return this.executeMutatingPipeline(operators, 'all')?.value;
        };
    }
    /**
     * COW hot paths for mutate(): the shared jsnq engine (pipeline-fastpath.ts) computes
     * the next value without deep-cloning untouched branches, then we commit it exactly like
     * the pipeline path would. Covers the flat-array where+actions shape, the single-action
     * structural shortcuts (root insert, flat delete_key, insert_to-inside-array) and the
     * sugar deep patch. Returns undefined outside the guards, in which case the full
     * clone+pipeline flow below runs unchanged.
     */
    tryFastMutate(operators) {
        const currentPath = this.fullPathPrefix;
        const storeInstance = this.storeInstance;
        const currentValue = currentPath
            ? storeInstance.readStore?.(currentPath)
            : storeInstance.store;
        if (currentValue === undefined)
            return undefined;
        const collectAffectedPaths = !!(storeInstance.preciseMutationWake &&
            currentPath &&
            storeInstance.commitMutationPrecise);
        const fast = tryFastPipelineMutation(currentValue, operators, { collectAffectedPaths });
        if (fast) {
            if (fast.mutations > 0) {
                // Opt-in fine-grained wake for sub-path branches (flat value-action shape only) —
                // mirrors SolidStore: wake exactly the changed leaves instead of the whole branch.
                if (storeInstance.preciseMutationWake && currentPath && storeInstance.commitMutationPrecise) {
                    const paths = fast.affectedPaths;
                    if (paths && paths.length > 0) {
                        storeInstance.commitMutationPrecise(currentPath, fast.value, paths);
                        return { value: fast.value };
                    }
                }
                this.commitPipelineData(storeInstance, currentPath, fast.value);
            }
            return { value: fast.value };
        }
        const intent = collectPipelineIntent(operators);
        const structural = tryFastStructuralMutation(currentValue, intent);
        if (structural) {
            this.commitPipelineData(storeInstance, currentPath, structural.value);
            return { value: structural.value };
        }
        // Sugar deep patch (where + update({patch})): not representable in the raw pipeline,
        // shared helper is the canonical semantics for every host.
        if (intent.criteria.length > 0 && intent.actions.length > 0 && intent.actions.every(isDeepSugarAction)) {
            const patched = applyDeepSugarPatch(currentValue, intent.criteria, intent.actions);
            this.commitPipelineData(storeInstance, currentPath, patched);
            return { value: patched };
        }
        return undefined;
    }
    createMutatingPipelineBuilder(_pathPrefix) {
        const operators = [];
        const execute = (mode) => {
            return this.executeMutatingPipeline(operators, mode);
        };
        const builder = {
            pipe: (...ops) => {
                operators.push(...ops);
                return builder;
            },
            all: () => execute('all'),
            first: () => execute('first'),
            count: () => execute('count')
        };
        const entry = ((...ops) => {
            if (ops.length) {
                builder.pipe(...ops);
            }
            return builder;
        });
        entry.pipe = builder.pipe;
        entry.all = builder.all;
        entry.first = builder.first;
        entry.count = builder.count;
        return entry;
    }
    executeMutatingPipeline(operators, mode) {
        const currentPath = this.fullPathPrefix;
        const storeInstance = this.storeInstance;
        const currentValue = currentPath
            ? storeInstance.readStore?.(currentPath)
            : storeInstance.store;
        if (currentValue === undefined) {
            logger.warn(`Cannot mutate undefined value at path: ${currentPath || 'root'}`);
            return undefined;
        }
        let pipeline = new JsnqPipeline(this.clonePipelineInput(currentValue), {
            trackOperations: this.shouldTrackPipelineOperations(),
        });
        for (const op of operators) {
            pipeline = op(pipeline);
        }
        const executed = this.mutatingPipelineModeHandlers[mode](pipeline);
        const stats = executed.executable.getStats();
        if (this.getPipelineMutationCount(stats) > 0) {
            this.commitPipelineData(storeInstance, currentPath, executed.executable.data);
        }
        return this.mutatingPipelineResponseHandlers[mode]({ ...executed, stats });
    }
    executeMutatingAll(pipeline) {
        const results = pipeline.all();
        return { executable: pipeline, results, count: results.length };
    }
    executeMutatingFirst(pipeline) {
        const executable = pipeline.with({ options: { ...pipeline.options, earlyTermination: true } });
        const results = executable.all();
        return { executable, results, count: results.length };
    }
    executeMutatingCount(pipeline) {
        const count = pipeline.count();
        return { executable: pipeline, results: [], count };
    }
    toPipelineExecutionResult(context) {
        return { value: context.executable.data, stats: context.stats, results: context.results };
    }
    toPipelineCountResult(context) {
        return { value: context.executable.data, stats: context.stats, count: context.count };
    }
    getPipelineMutationCount(stats) {
        return (stats.replaces +
            stats.updates +
            stats.mergeUpdates +
            stats.deletedKeys +
            stats.deletedElements +
            stats.inserted +
            stats.moved +
            stats.copied);
    }
    commitPipelineData(storeInstance, currentPath, data) {
        const service = storeInstance.createServiceGetter;
        service?.beginAction?.();
        try {
            if (currentPath && currentPath.length > 0) {
                storeInstance.setValue?.(currentPath, data);
                return;
            }
            const newRoot = data;
            const currentRoot = storeInstance.store;
            const keys = new Set([
                ...Object.keys(currentRoot || {}),
                ...Object.keys(newRoot || {}),
            ]);
            for (const key of keys) {
                if (!(key in newRoot)) {
                    storeInstance.deleteValue?.(key);
                }
                else {
                    storeInstance.setValue?.(key, newRoot[key]);
                }
            }
        }
        finally {
            service?.endAction?.();
        }
    }
    /**
     * Creates reactive pipeline builder (for queries without mutations)
     * Returns Signal-based results
     */
    createReactivePipelineBuilder(pathPrefix) {
        const normalizedPath = pathPrefix;
        const storeInstance = this.storeInstance;
        const service = storeInstance.createServiceGetter;
        const collectOps = () => {
            const operators = [];
            const createCacheKey = (mode) => {
                // Serialize operators with their metadata if available
                const opsSerialized = operators.map((op) => this.getOperatorCacheSegment(op)).join('|');
                const hash = hashString(opsSerialized + mode);
                const prefix = normalizedPath && normalizedPath.length > 0 ? `${normalizedPath}.` : '';
                return `${prefix}$pipeline.${hash}`;
            };
            const execute = (mode) => {
                const cacheKey = createCacheKey(mode);
                // Check if cached computed exists
                const cached = service?.getSignalFromProxyCache?.(cacheKey);
                if (cached) {
                    return cached;
                }
                // Create new computed signal
                const sig = computed(() => {
                    // Track version for reactivity
                    const versionPath = service?.resolveVersionPathNormalized
                        ? service.resolveVersionPathNormalized(normalizedPath)
                        : service?.resolveVersionPath?.(normalizedPath) || normalizedPath;
                    const version = service?.getVersion?.(versionPath);
                    version?.();
                    const currentValue = normalizedPath
                        ? storeInstance.readStore?.(normalizedPath)
                        : storeInstance.store;
                    if (currentValue === undefined) {
                        return this.emptyPipelineResultHandlers[mode]();
                    }
                    const hasMutations = collectPipelineIntent(operators).actions.length > 0;
                    let pipeline = new JsnqPipeline((hasMutations ? cloneJsonData(currentValue) : currentValue), { trackOperations: this.shouldTrackPipelineOperations() });
                    for (const op of operators) {
                        pipeline = op(pipeline);
                    }
                    return this.reactivePipelineResultHandlers[mode](pipeline);
                }, ...(ngDevMode ? [{ debugName: "sig" }] : []));
                // Cache the computed signal in both proxy cache and computed store
                if (service?.registerPipelineComputed) {
                    service.registerPipelineComputed(cacheKey, sig);
                }
                else {
                    service?.setSignalInProxyCache?.(cacheKey, sig);
                }
                return sig;
            };
            const builder = {
                pipe: (...ops) => {
                    operators.push(...ops);
                    return builder;
                },
                all: () => execute('all'),
                first: () => execute('first'),
                count: () => execute('count'),
            };
            return builder;
        };
        const builder = collectOps();
        const entry = ((...ops) => {
            if (ops.length) {
                builder.pipe(...ops);
            }
            return builder;
        });
        entry.pipe = builder.pipe;
        entry.all = builder.all;
        entry.first = builder.first;
        entry.count = builder.count;
        return entry;
    }
    /**
     * one-shot snapshot query using the JSNQ DSL. Returns matched values (not result
     * nodes), mirroring solid-store's $query/$queryOne. Non-reactive — reads the current value once.
     */
    createSnapshotQueryMethod(mode) {
        const path = this.fullPathPrefix;
        return (...ops) => {
            const current = path
                ? this.storeInstance.readStore?.(path)
                : this.storeInstance.store;
            if (current === undefined)
                return mode === 'first' ? null : [];
            const hasMutations = collectPipelineIntent(ops).actions.length > 0;
            let pipeline = new JsnqPipeline((hasMutations ? cloneJsonData(current) : current), {
                trackOperations: this.shouldTrackPipelineOperations(),
            });
            for (const op of ops)
                pipeline = op(pipeline);
            if (mode === 'first') {
                return pipeline.first();
            }
            return pipeline.all().map((node) => (node && typeof node === 'object' && 'data' in node ? node.data : node));
        };
    }
    /**
     * reactive live query — a callable accessor (read it in a computed/effect/template)
     * that recomputes when the queried branch changes. Built on the existing reactive pipeline
     * builder (version-tracked Angular computed); maps result nodes to matched values.
     */
    createLiveQueryMethod(mode) {
        const path = this.fullPathPrefix;
        return (...ops) => {
            const entry = this.createReactivePipelineBuilder(path);
            const chained = entry(...ops);
            if (mode === 'first') {
                const sig = chained.first();
                return () => {
                    return sig() ?? null;
                };
            }
            const sig = chained.all();
            return () => (sig() ?? []).map((node) => (node && typeof node === 'object' && 'data' in node ? node.data : node));
        };
    }
    /* -------------------------------------------------------------------------- */
    /*                                  helpers                                   */
    /* -------------------------------------------------------------------------- */
    get fullPathPrefix() {
        return this.options.pathPrefix || '';
    }
    /* -------------------------------------------------------------------------- */
    /*                       BaseProxyHandler abstract impl                       */
    /* -------------------------------------------------------------------------- */
    constructPath(key) {
        return this.fullPathPrefix ? `${this.fullPathPrefix}.${key}` : key;
    }
    resolveValue(path) {
        return this.options.resolveFn(path);
    }
    createNestedProxy(path, value, _key) {
        const direct = this.options.nestedProxyFactory(path, value);
        return direct;
    }
    handleStoreInstanceMethods(keyStr) {
        const proxyApiMethod = this.createProxyApiMethod(keyStr);
        if (proxyApiMethod) {
            return proxyApiMethod;
        }
        if (!this.options.exposeStoreMethods) {
            return null;
        }
        return typeof this.storeInstance[keyStr] === 'function'
            ? this.storeInstance[keyStr].bind(this.storeInstance)
            : null;
    }
    createProxyApiMethod(keyStr) {
        switch (keyStr) {
            case 'mutate':
            case '$mutate':
                return this.createMutateMethod();
            case 'query':
                return this.createReactivePipelineBuilder(this.fullPathPrefix);
            case 'pipeline':
                return this.createSmartPipelineBuilder(this.fullPathPrefix);
            case '$query':
                return this.createSnapshotQueryMethod('all');
            case '$queryOne':
                return this.createSnapshotQueryMethod('first');
            case '$liveQuery':
                return this.createLiveQueryMethod('all');
            case '$liveQueryOne':
                return this.createLiveQueryMethod('first');
            default:
                return null;
        }
    }
    setValue(path, value) {
        if (value === undefined && this.options.strictDeleteUndefined) {
            throw new Error(`Setting undefined is not allowed in strict mode for path: ${path}`);
        }
        if (this.options.setFn) {
            this.options.setFn(path, value);
        }
        else if (isValidPath(path)) {
            this.storeInstance.setValue(path, value);
        }
        else {
            if (this.options.strictInvalidPath) {
                throw new Error(`Invalid path for setValue: ${path}`);
            }
            else {
                logger.warn(`Invalid path for setValue: ${path}`);
            }
        }
    }
    deleteValue(path) {
        if (this.options.deleteFn) {
            // In strict mode, allow deletion when a dedicated deleteFn is provided
            // (implementation is expected to perform safe cleanup). Otherwise, block.
            this.options.deleteFn(path);
        }
        else if (isValidPath(path)) {
            if (this.options.strictDeleteUndefined) {
                throw new Error(`Delete operation is not allowed in strict mode for path: ${path}`);
            }
            this.storeInstance.setValue(path, undefined);
        }
        else {
            if (this.options.strictInvalidPath) {
                throw new Error(`Invalid path for deleteValue: ${path}`);
            }
            else {
                logger.warn(`Invalid path for deleteValue: ${path}`);
            }
        }
    }
    performCleanup() {
        if (this.options.cleanupFn) {
            this.options.cleanupFn();
        }
    }
    /* -------------------------------------------------------------------------- */
    /*                          Special-case method hooks                          */
    /* -------------------------------------------------------------------------- */
    resolveRxJSPath(keyStr, path) {
        return (keyStr === 'pipe' || keyStr === 'subscribe')
            ? this.resolveRootRxJSPath(keyStr, path)
            : path;
    }
    resolveRootRxJSPath(keyStr, _path) {
        if (this.options.rxjsAllowedOnRoot === false) {
            if (this.options.strictRootRxjs) {
                throw new Error(`RxJS method '${keyStr}' is not allowed on root proxy in strict mode`);
            }
            return null; // Block pipe/subscribe on root-level proxy
        }
        // For RxJS helper methods (pipe / subscribe) we want them to operate on the *current* proxy path,
        // not on a fictitious "path.method" path that includes the method name. The Base implementation
        // receives the full "path.method" string, so we need to strip the trailing method part before
        // delegating.
        return this.fullPathPrefix;
    }
    getArrayMethodPath(path) {
        return this.fullPathPrefix || path;
    }
    getArrayMethodCandidate(value) {
        return this.fullPathPrefix ? this.resolveValue(this.fullPathPrefix) : (this.options.originalNestedValue ?? value);
    }
    getPropertyCache() {
        return this.nestedCache;
    }
    getArrayMutationCleanup() {
        return () => this.clearNestedCache();
    }
    getArrayQueryCache() {
        return this.arrayQueryCache;
    }
    getArrayMutationMethodCache() {
        return this.arrayMutationMethodCache;
    }
    getCachedProperty(keyStr, _currentPath) {
        if (Object.prototype.hasOwnProperty.call(this.nestedCache, keyStr)) {
            return this.nestedCache[keyStr];
        }
        return BaseProxyHandler.UNHANDLED;
    }
    cacheResolvedProperty(keyStr, _currentPath, _currentValue, resolvedValue) {
        const hadKey = Object.prototype.hasOwnProperty.call(this.nestedCache, keyStr);
        if (!hadKey && this.nestedCacheSize > 200) {
            this.clearNestedCache();
        }
        if (!hadKey)
            this.nestedCacheSize++;
        this.nestedCache[keyStr] = resolvedValue;
        return resolvedValue;
    }
    afterSetProperty(keyStr, _targetPath, value) {
        if (value === undefined) {
            this.deleteNestedCacheKey(keyStr);
        }
    }
    afterDeleteProperty(keyStr) {
        this.deleteNestedCacheKey(keyStr);
    }
}

/**
 * Builds a "callable proxy" – function returning reactive/computed value
 * while still exposing deep property access with the same proxy logic.
 *
 * API pozostaje identyczne jak w poprzednim `ProxyMethods.createCallableProxy`.
 */
function createCallableProxy(nestedPath, storeInstance, nestedValue, nestedProxyFactory, options = {}) {
    const serviceHost = storeInstance;
    const createService = serviceHost.createService ??
        serviceHost.createServiceGetter ??
        serviceHost.getCreateService;
    const isCollectingReads = createService?.isCollectingReads?.bind(createService);
    const registerRead = createService?.registerRead?.bind(createService);
    const registerReadNormalized = createService?.registerReadNormalized?.bind(createService);
    let normalizedReadPath;
    const getNormalizedReadPath = () => normalizedReadPath ??= PathUtils.normalizePath(nestedPath);
    const trackRead = () => {
        if (!isCollectingReads?.())
            return;
        if (registerReadNormalized) {
            registerReadNormalized(getNormalizedReadPath());
            return;
        }
        registerRead?.(nestedPath);
    };
    // Lazily resolve and cache the Signal for this path (avoid repeated look-ups)
    let cachedSignal;
    let cachedRead;
    const getSignalOnce = () => {
        if (cachedSignal)
            return cachedSignal;
        // 1) Try proxy-level fast cache from CreateStoreService
        const fast = createService?.getSignalFromProxyCache?.(nestedPath);
        if (fast) {
            cachedSignal = fast;
            return cachedSignal;
        }
        // 2) Fallback to store computed and save into proxy signal cache
        cachedSignal = storeInstance.getComputed(nestedPath);
        if (cachedSignal && createService?.setSignalInProxyCache) {
            createService.setSignalInProxyCache(nestedPath, cachedSignal);
        }
        return cachedSignal;
    };
    const readValue = () => {
        trackRead();
        if (cachedRead)
            return cachedRead();
        const signal = getSignalOnce();
        if (!signal)
            return undefined;
        cachedRead = signal;
        return cachedRead();
    };
    // --- callable function ----------------------------------------------------
    const callable = (() => {
        return readValue();
    });
    // Expose fast-path properties directly on callable to avoid store lookups in proxy handler
    try {
        Object.defineProperty(callable, '$signal', {
            get: () => getSignalOnce(),
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(callable, '$val', {
            get: () => readValue(),
            enumerable: false,
            configurable: true
        });
    }
    catch (e) {
        console.warn('CallableProxy defineProperty error:', e);
    }
    // --- proxy handler --------------------------------------------------------
    const handler = new GenericProxyHandler(storeInstance, {
        pathPrefix: nestedPath,
        exposeStoreMethods: false,
        originalNestedValue: nestedValue,
        resolveFn: (path) => {
            if (!path)
                return storeInstance.returnStore?.();
            return PathUtils.getByPath(storeInstance.returnStore?.(), path);
        },
        nestedProxyFactory: nestedProxyFactory || ((path, value) => createCallableProxy(path, storeInstance, value, undefined, options)),
        rxjsAllowedOnRoot: true,
        strictInvalidPath: !!options.strictInvalidPath,
        strictDeleteUndefined: !!options.strictDeleteUndefined,
        setFn: options.setFn,
        deleteFn: options.deleteFn,
        cleanupFn: options.cleanupFn,
    });
    const readCurrentValue = () => {
        return readValue();
    };
    const baseGet = handler.createProxyGetter(callable);
    return new Proxy(callable, {
        get(_target, key, receiver) {
            // Intercept coercion traps so they work through the Proxy, not just the target
            if (key === 'toString') {
                return () => {
                    const v = readCurrentValue();
                    try {
                        return typeof v === 'object' ? JSON.stringify(v) : String(v);
                    }
                    catch {
                        return String(v);
                    }
                };
            }
            if (key === 'valueOf') {
                return () => Object(readCurrentValue());
            }
            if (key === 'toJSON') {
                return () => readCurrentValue();
            }
            if (key === Symbol.toPrimitive) {
                return (hint) => {
                    const v = readCurrentValue();
                    if (typeof v === 'object' || typeof v === 'function') {
                        if (hint === 'number')
                            return NaN;
                        try {
                            return JSON.stringify(v);
                        }
                        catch {
                            return '[object Object]';
                        }
                    }
                    return v;
                };
            }
            return baseGet(_target, key, receiver);
        },
        set: handler.createProxySetter(),
        deleteProperty: handler.createProxyDeleter(),
    });
}

class ProxyFactory {
    maxCacheSize;
    logger;
    metricsCallback;
    storeName;
    signalStore;
    useInPlaceIteration;
    createStoreService;
    strictInvalidPath;
    strictRootRxjs;
    strictDeleteUndefined;
    rxjsAllowedOnRoot;
    metricsIntervalId = null;
    pathReader = new PathReader();
    constructor(config = {}) {
        this.maxCacheSize = config.maxCacheSize ?? 1000;
        this.logger = config.logger ?? console;
        this.metricsCallback = config.metricsCallback;
        this.storeName = config.storeName;
        this.signalStore = config.signalStore;
        this.useInPlaceIteration = config.useInPlaceIteration ?? false;
        this.createStoreService = config.createStoreService;
        this.strictInvalidPath = !!config.strictInvalidPath;
        this.strictRootRxjs = !!config.strictRootRxjs;
        this.strictDeleteUndefined = !!config.strictDeleteUndefined;
        this.rxjsAllowedOnRoot = config.rxjsAllowedOnRoot ?? true;
        this.configureProxyCacheLimit();
        if (this.metricsCallback && this.storeName) {
            this.updateMetricsTimer(!!this.signalStore?.devActive);
        }
    }
    updateMetricsTimer(active) {
        if (!this.metricsCallback || !this.storeName)
            return;
        if (active) {
            if (this.metricsIntervalId)
                return;
            this.metricsIntervalId = setInterval(() => {
                const metrics = this.createStoreService.getProxyCacheMetrics();
                if (this.metricsCallback) {
                    this.metricsCallback(this.storeName, metrics);
                }
            }, 2000);
        }
        else {
            if (this.metricsIntervalId) {
                clearInterval(this.metricsIntervalId);
                this.metricsIntervalId = null;
            }
        }
    }
    destroy() {
        if (this.storeName) {
            this.createStoreService.resetProxyCache();
            this.clearProxyCacheLimit();
        }
        if (this.metricsIntervalId) {
            clearInterval(this.metricsIntervalId);
            this.metricsIntervalId = null;
        }
    }
    getCacheMetrics() {
        if (!this.storeName) {
            return { hits: 0, misses: 0, hitRate: 0, cacheSize: 0, cacheKeys: [], cacheDump: [] };
        }
        const metrics = this.createStoreService.getProxyCacheMetrics();
        const cacheDump = this.createStoreService.getProxyCacheDump();
        return {
            ...metrics,
            cacheSize: metrics.cacheKeys.length,
            cacheKeys: metrics.cacheKeys,
            cacheDump
        };
    }
    resetCache() {
        if (this.storeName) {
            this.createStoreService.resetProxyCache();
        }
    }
    recordCacheHit() {
        if (this.storeName) {
            this.createStoreService.recordProxyCacheHit();
        }
    }
    recordCacheMiss() {
        if (this.storeName) {
            this.createStoreService.recordProxyCacheMiss();
        }
    }
    configureProxyCacheLimit() {
        if (!this.storeName || !this.signalStore)
            return;
        this.signalStore.setProxyCacheLimit(this.storeName, this.maxCacheSize);
    }
    clearProxyCacheLimit() {
        if (!this.storeName || !this.signalStore)
            return;
        this.signalStore.clearProxyCacheLimit(this.storeName);
    }
    clearCacheForPath(path) {
        if (this.storeName) {
            this.createStoreService.clearProxyCacheForPath(path);
        }
    }
    getValueIteratively(storeInstance, path) {
        if (this.useInPlaceIteration && path.indexOf('[') === -1) {
            return this.readDotPathInPlace(storeInstance.store, path);
        }
        return this.pathReader.read(storeInstance.store, path);
    }
    readDotPathInPlace(root, path) {
        if (!root || !path)
            return undefined;
        let current = root;
        let start = 0;
        for (let i = 0; i <= path.length; i++) {
            if (i !== path.length && path.charCodeAt(i) !== 46)
                continue;
            if (current == null)
                return undefined;
            const segment = path.slice(start, i);
            current = current[segment];
            start = i + 1;
        }
        return current;
    }
    cacheMake(path, value, storeInstance, nestedProxyFactory, callableOptions) {
        const cached = this.createStoreService.getProxyCacheEntry(path);
        if (cached) {
            this.recordCacheHit();
            return cached;
        }
        this.recordCacheMiss();
        const callableProxy = createCallableProxy(path, storeInstance, value, nestedProxyFactory, callableOptions);
        this.createStoreService.setProxyCacheEntry(callableProxy, path);
        if (path.includes('.')) {
            const segments = path.split('.');
            let prefix = '';
            for (let i = 0; i < segments.length - 1; i++) {
                prefix = prefix ? `${prefix}.${segments[i]}` : segments[i];
                if (!this.createStoreService.getProxyCacheEntry(prefix)) {
                    const intermediateValue = this.getValueIteratively(storeInstance, prefix);
                    if (intermediateValue !== undefined) {
                        const intermediateProxy = createCallableProxy(prefix, storeInstance, intermediateValue, nestedProxyFactory, callableOptions);
                        this.createStoreService.setProxyCacheEntry(intermediateProxy, prefix);
                        try {
                            storeInstance.prefetchCursorWithNode?.(prefix, intermediateValue);
                        }
                        catch (e) {
                            console.warn('ProxyFactory prefetchCursor error:', e);
                        }
                    }
                }
            }
        }
        return callableProxy;
    }
    createStoreProxy(storeInstance) {
        const setFn = (p, v) => {
            if (v === undefined && this.strictDeleteUndefined) {
                throw new Error(`Setting undefined is not allowed in strict mode for path: ${p}`);
            }
            if (v === undefined) {
                deleteFn(p);
                return;
            }
            const fast = storeInstance.setValueFast;
            if (typeof fast === 'function') {
                if (!PathUtils.isValidPath(p)) {
                    if (this.strictInvalidPath)
                        throw new Error(`Invalid path for setValueFast: ${p}`);
                    this.logger.warn(`Invalid path for setValueFast: ${p}`);
                    return;
                }
                fast.call(storeInstance, p, v);
                return;
            }
            if (!PathUtils.isValidPath(p)) {
                if (this.strictInvalidPath)
                    throw new Error(`Invalid path for setValue: ${p}`);
                this.logger.warn(`Invalid path for setValue: ${p}`);
                return;
            }
            storeInstance.setValueObserve(p, v);
        };
        const deleteFn = (p) => {
            if (this.strictDeleteUndefined) {
                throw new Error(`Delete operation is not allowed in strict mode for path: ${p}`);
            }
            if (!PathUtils.isValidPath(p)) {
                if (this.strictInvalidPath)
                    throw new Error(`Invalid path for deleteValue: ${p}`);
                this.logger.warn(`Invalid path for deleteValue: ${p}`);
                return;
            }
            if (storeInstance.deleteValue) {
                storeInstance.deleteValue(p);
            }
            else {
                storeInstance.cleanupPath(p);
                storeInstance.setValue(p, undefined);
            }
        };
        const callableOptions = {
            strictInvalidPath: this.strictInvalidPath,
            strictDeleteUndefined: this.strictDeleteUndefined,
            setFn,
            deleteFn,
        };
        const nestedProxyFactory = (path, value) => {
            try {
                return this.cacheMake(path, value, storeInstance, nestedProxyFactory, callableOptions);
            }
            catch (error) {
                this.logger.warn(`Error creating proxy for path ${path}:`, error);
                return createCallableProxy(path, storeInstance, value, nestedProxyFactory, callableOptions);
            }
        };
        const handler = new GenericProxyHandler(storeInstance, {
            pathPrefix: '',
            exposeStoreMethods: true,
            resolveFn: (path) => this.getValueIteratively(storeInstance, path),
            nestedProxyFactory,
            rxjsAllowedOnRoot: this.rxjsAllowedOnRoot,
            strictInvalidPath: this.strictInvalidPath,
            strictRootRxjs: this.strictRootRxjs,
            strictDeleteUndefined: this.strictDeleteUndefined,
            originalNestedValue: undefined,
            setFn,
            deleteFn,
        });
        const proxyStore = new Proxy({}, {
            get: handler.createProxyGetter({}),
            set: handler.createProxySetter(),
            deleteProperty: handler.createProxyDeleter()
        });
        return proxyStore;
    }
}

const SIGNAL_STORE_DEVTOOLS = new InjectionToken('SIGNAL_STORE_DEVTOOLS');

class SignalStore {
    devService;
    devActive = false;
    // Map przechowujący "surowe" instancje CreateStore (pełna funkcjonalność)
    storeInstances = Object.create(null);
    // Map przechowujący gotowe proxowane sklepy, zwracane na zewnątrz
    storeProxies = Object.create(null);
    // Referencje do ProxyFactory, by móc zarządzać timerami metryk
    proxyFactories = Object.create(null);
    // Konfiguracja limitow proxy cache per store
    proxyCacheLimits = Object.create(null);
    storeWaiters = new Map();
    // ------------------------------
    // Graph-based stores - moved to CreateStoreService
    // ------------------------------
    constructor(devService = null) {
        this.devService = devService;
        setLoggerActive(this.devActive);
    }
    /* ----------------------------------------------------------------
     * DevTools helpers – serve jako centralny "bus" dla panelu DevTools
     * --------------------------------------------------------------*/
    get devAction$() { return this.devService?.action$ ?? EMPTY; }
    get devReadAction$() { return this.devService?.readAction$ ?? EMPTY; }
    attachDevtools(devtools) {
        this.devService = devtools;
    }
    getDevtoolsAdapter() {
        return this.devService ?? undefined;
    }
    emitDevAction(storeName, action) {
        if (this.devActive) {
            const event = { ...action, storeName };
            queueMicrotask(() => this.devService?.emitAction(event));
            // default also into read stream (history) unless proxy metrics (filtered below)
            if (action.type !== 'PROXY_METRICS') {
                this.devService?.emitRead(event);
            }
        }
        return;
    }
    devActivation(devActive) {
        this.devActive = devActive;
        setLoggerActive(devActive);
        // Toggle metrics timers for all proxy factories
        Object.values(this.proxyFactories).forEach((pf) => pf.updateMetricsTimer(devActive));
    }
    setMetricsThrottle(ms) {
        this.metricsThrottleMs = Math.max(0, ms);
    }
    // Optional: bind an external observable<boolean> to drive dev activation
    bindDevActivation(devActive$) {
        return devActive$.subscribe((active) => this.devActivation(!!active));
    }
    // manual push to read stream if needed
    emitDevReadAction(storeName, data) {
        const event = { ...data, storeName };
        this.devService?.emitRead(event);
    }
    // Throttle metrics emission per store
    lastMetricsEmit = Object.create(null);
    metricsThrottleMs = 250; // conservative default
    emitProxyMetrics(storeName, metrics) {
        // Proxy metrics now handled by CreateStoreService
        if (!this.devActive)
            return;
        const now = Date.now();
        const last = this.lastMetricsEmit[storeName] || 0;
        if (now - last < this.metricsThrottleMs)
            return;
        this.lastMetricsEmit[storeName] = now;
        const proxyAction = {
            type: 'PROXY_METRICS',
            payload: {
                path: 'proxy-cache',
                ...metrics,
                cacheDump: [],
                cacheKeys: []
            }
        };
        const event = { ...proxyAction, storeName };
        // send only to action stream, not to read history (user request)
        queueMicrotask(() => this.devService?.emitAction(event));
    }
    createStore(val, name, options) {
        if (!name || typeof name !== 'string') {
            throw new Error(`Store name must be a non-empty string. Received: ${String(name)}`);
        }
        if (this.storeInstances[name] || this.storeProxies[name]) {
            throw new Error(`Store '${name}' already exists. Use useStore('${name}') instead of creating it again.`);
        }
        // 1. Create low-level store instance responsible for all logic
        const storeInstance = new CreateStore(this, name, undefined, this.devService ?? undefined);
        // Apply dependency mode if provided
        if (options?.dependencyMode) {
            storeInstance.createServiceGetter.setDependencyMode(options.dependencyMode);
        }
        // Apply version bump configuration if provided
        if (options?.versionBump) {
            const vb = options.versionBump;
            if (vb.strategy)
                storeInstance.createServiceGetter.setVersionBumpStrategy(vb.strategy);
            if (typeof vb.throttleMs === 'number')
                storeInstance.createServiceGetter.setVersionBumpThrottle(vb.throttleMs);
            if (typeof vb.partialInvalidation === 'boolean')
                storeInstance.createServiceGetter.setPartialInvalidation(vb.partialInvalidation);
        }
        // 2. Set initial value inside the store **before** proxy is built
        const initial = options?.cloneInitialValue === 'none' ? val : structuredClone(val);
        Object.assign(storeInstance.returnStore(), initial);
        // 3. Create proxy that exposes reactive API for consumers
        const proxyFactory = new ProxyFactory({
            metricsCallback: (_storeName, metrics) => {
                storeInstance.createServiceGetter.emitProxyMetrics(metrics);
            },
            maxCacheSize: options?.proxyCacheMaxSize,
            storeName: name,
            signalStore: this,
            createStoreService: storeInstance.createService,
            useInPlaceIteration: !!options?.useInPlaceIteration,
            strictInvalidPath: !!options?.strict?.invalidPath,
            strictRootRxjs: !!options?.strict?.rootRxjs,
            strictDeleteUndefined: !!options?.strict?.deleteUndefined,
            rxjsAllowedOnRoot: options?.rxjsAllowedOnRoot ?? true
        });
        if (typeof options?.metricsThrottleMs === 'number') {
            this.metricsThrottleMs = Math.max(0, options.metricsThrottleMs);
        }
        const proxyStore = proxyFactory.createStoreProxy(storeInstance);
        // 4. Zapisz oddzielnie instancję i proxy
        this.storeInstances[name] = storeInstance;
        this.storeProxies[name] = proxyStore;
        this.proxyFactories[name] = proxyFactory;
        this.resolveStoreWaiters(name, proxyStore);
        return proxyStore;
    }
    /** Wait for a named proxy without changing the synchronous useStore/getStore contract. */
    waitForStore(name, options = {}) {
        const existing = this.storeProxies[name];
        if (existing)
            return Promise.resolve(existing);
        const abortError = () => Object.assign(new Error(`waitForStore('${name}') aborted.`), { name: 'AbortError' });
        if (options.signal?.aborted)
            return Promise.reject(abortError());
        return new Promise((resolve, reject) => {
            let timer;
            const waiters = this.storeWaiters.get(name) ?? new Set();
            const onAbort = () => finishReject(abortError());
            const waiter = {
                resolve: (store) => resolve(store),
                reject,
                cleanup: () => {
                    if (timer !== undefined)
                        clearTimeout(timer);
                    options.signal?.removeEventListener('abort', onAbort);
                },
            };
            const finishReject = (error) => {
                waiters.delete(waiter);
                if (waiters.size === 0)
                    this.storeWaiters.delete(name);
                waiter.cleanup();
                waiter.reject(error);
            };
            waiters.add(waiter);
            this.storeWaiters.set(name, waiters);
            options.signal?.addEventListener('abort', onAbort, { once: true });
            if (options.timeoutMs !== undefined) {
                const timeoutMs = Math.max(0, options.timeoutMs);
                timer = setTimeout(() => finishReject(new Error(`waitForStore('${name}') timed out after ${timeoutMs}ms.`)), timeoutMs);
            }
        });
    }
    resolveStoreWaiters(name, store) {
        const waiters = this.storeWaiters.get(name);
        if (!waiters)
            return;
        this.storeWaiters.delete(name);
        for (const waiter of waiters) {
            waiter.cleanup();
            waiter.resolve(store);
        }
    }
    /**
     * Zwraca wewnętrzną instancję CreateStore używaną przez logikę biblioteki.
     * Używane jedynie wewnętrznie; dla komponentów/serwisów należy użyć useStore().
     */
    // Public for internal consumers across library (kept for compatibility)
    getStore(name) {
        return this.storeInstances[name];
    }
    /**
     * Register a store instance built directly via `new CreateStore(name)` so that
     * `getStore(name)` (used by typed array operations, base manager, etc.) resolves it.
     * Idempotent: the createStore factory assigns the same instance afterwards, and a
     * second direct construction with the same name is left to the factory's own guard.
     */
    registerStoreInstance(name, instance) {
        if (name && !this.storeInstances[name]) {
            this.storeInstances[name] = instance;
        }
    }
    destroyStore(name) {
        const storeInstance = this.storeInstances[name];
        const proxyFactory = this.proxyFactories[name];
        if (!storeInstance && !proxyFactory && !this.storeProxies[name]) {
            return;
        }
        try {
            proxyFactory?.destroy?.();
        }
        catch (e) {
            console.warn('SignalStore proxyFactory destroy error:', e);
        }
        try {
            if (typeof storeInstance?.destroy === 'function') {
                storeInstance.destroy();
            }
        }
        catch (e) {
            console.warn('SignalStore storeInstance destroy error:', e);
        }
        delete this.storeInstances[name];
        delete this.storeProxies[name];
        delete this.proxyFactories[name];
        delete this.lastMetricsEmit[name];
        delete this.proxyCacheLimits[name];
    }
    removeStore(name) {
        this.destroyStore(name);
    }
    useStore(name) {
        const proxy = this.storeProxies[name];
        if (!proxy) {
            throw new Error(`Store '${name}' not found. Make sure to create it first with createStore().`);
        }
        return proxy;
    }
    // Public API compatibility method
    createCallableProxy(nestedPath, storeInstance, nestedValue) {
        return createCallableProxy(nestedPath, storeInstance, nestedValue);
    }
    // Proxy cache operations - moved to CreateStoreService
    // Computed, Behavior and Proxy operations - moved to CreateStoreService
    // Store operations (przeniesione z StoreOperations)
    setValue(storeName, path, val) {
        const store = this.getStore(storeName);
        const normalized = PathUtils.normalizePath(path);
        const previousValue = store.readStore(normalized);
        const oldValue = this.devActive ? previousValue : undefined;
        // In-place mutation without Immer/root update (legacy API)
        PathUtils.setByPath(store.returnStore(), normalized, val);
        // DevTools logging
        if (this.devActive) {
            this.emitDevAction(storeName, {
                type: 'SET_VALUE',
                payload: {
                    path: normalized,
                    oldValue,
                    value: val
                }
            });
        }
        store.wakeUpMutationPath(normalized, val, {
            syncDescendants: PathUtils.isBranchValue(previousValue) ||
                PathUtils.isBranchValue(val)
        });
    }
    read(storeName, path) {
        const store = this.getStore(storeName);
        const normalized = PathUtils.normalizePath(path);
        const segments = store.createServiceGetter.getPathSegments(normalized);
        return store.createServiceGetter.fastReadBySegments(store.returnStore(), segments);
    }
    // Legacy aliases (kept to avoid breaking internal imports)
    readStore(storeName, path) {
        return this.read(storeName, path);
    }
    getSignalValue(storeName, path) {
        return this.read(storeName, path);
    }
    setProxyCacheLimit(storeName, limit) {
        if (!storeName)
            return;
        this.proxyCacheLimits[storeName] = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 1000;
    }
    getProxyCacheLimit(storeName) {
        return this.proxyCacheLimits[storeName];
    }
    clearProxyCacheLimit(storeName) {
        delete this.proxyCacheLimits[storeName];
    }
    // Typed read via selector function with inference
    select(storeName, selector) {
        const store = this.getStore(storeName);
        const root = store.returnStore();
        return selector(root);
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.26", ngImport: i0, type: SignalStore, deps: [{ token: SIGNAL_STORE_DEVTOOLS, optional: true }], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.26", ngImport: i0, type: SignalStore, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.26", ngImport: i0, type: SignalStore, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root'
                }]
        }], ctorParameters: () => [{ type: undefined, decorators: [{
                    type: Optional
                }, {
                    type: Inject,
                    args: [SIGNAL_STORE_DEVTOOLS]
                }] }] });

// Main exports for the store

/**
 * Generated bundle index. Do not edit.
 */

export { CreateStore, SIGNAL_STORE_DEVTOOLS, SignalStore };
//# sourceMappingURL=synestiqx-angular-signal-store.mjs.map
