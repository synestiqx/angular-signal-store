export type PathSegments = readonly string[];
export type VersionDependencyMode = 'exact' | 'container';

export interface SplitPathOptions {
  normalize?: boolean;
  filterEmpty?: boolean;
}

export interface PathMutationOptions {
  createArrays?: boolean;
  guardForbidden?: boolean;
}

export interface ResolveVersionPathOptions {
  dependencyMode: VersionDependencyMode;
  bumpNumericParent: boolean;
}

const BRACKET_SEGMENT_RE = /\[(.*?)\]/g;
const BASIC_PATH_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z0-9_$]+|\[\d+\])*$/;
const NORMALIZED_PATH_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z0-9_$]+)*$/;
const NUMERIC_SEGMENT_RE = /^\d+$/;
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function isTraversable(value: unknown): value is Record<string, unknown> {
  return value != null && (typeof value === 'object' || typeof value === 'function');
}

export function normalizePathCore(path: string): string {
  if (!path) return '';
  return path.indexOf('[') === -1 ? path : path.replace(BRACKET_SEGMENT_RE, '.$1');
}

export function splitPathCore(path: string, options: SplitPathOptions = {}): string[] {
  if (!path) return [];
  const normalized = options.normalize === false ? path : normalizePathCore(path);
  const parts = normalized ? normalized.split('.') : [];
  return options.filterEmpty ? parts.filter(Boolean) : parts;
}

export function isNumericSegmentCore(segment: string | undefined | null): boolean {
  return !!segment && NUMERIC_SEGMENT_RE.test(segment);
}

export function isForbiddenPathSegmentCore(segment: unknown): boolean {
  return segment !== undefined && segment !== null && FORBIDDEN_PATH_SEGMENTS.has(String(segment));
}

export function hasForbiddenPathSegmentCore(segments: readonly unknown[]): boolean {
  for (const segment of segments) {
    if (isForbiddenPathSegmentCore(segment)) return true;
  }
  return false;
}

export function isValidNormalizedPathCore(normalized: string): boolean {
  return typeof normalized === 'string' &&
    normalized.length > 0 &&
    NORMALIZED_PATH_RE.test(normalized) &&
    !hasForbiddenPathSegmentCore(splitPathCore(normalized, { normalize: false }));
}

export function isValidPathCore(path: string): boolean {
  if (!path || typeof path !== 'string' || path.trim().length === 0) return false;
  try {
    return isValidNormalizedPathCore(normalizePathCore(path));
  } catch {
    return BASIC_PATH_RE.test(path);
  }
}

export function assertSafePathSegmentsCore(segments: readonly unknown[], path: string): void {
  if (hasForbiddenPathSegmentCore(segments)) {
    throw new Error(`Unsafe path segment in '${path}'`);
  }
}

export function getBySegmentsCore<T = unknown>(
  obj: unknown,
  segments: PathSegments,
  options: { guardForbidden?: boolean } = {}
): T | undefined {
  if (options.guardForbidden && hasForbiddenPathSegmentCore(segments)) return undefined;
  let current: unknown = obj;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current as T | undefined;
}

export function getByPathCore<T = unknown>(
  obj: unknown,
  path: string,
  options: { rootReturnsObject?: boolean; guardForbidden?: boolean; filterEmpty?: boolean } = {}
): T | undefined {
  if (!obj) return undefined;
  if (!path) return options.rootReturnsObject ? (obj as T) : undefined;
  return getBySegmentsCore<T>(
    obj,
    splitPathCore(path, { filterEmpty: options.filterEmpty }),
    { guardForbidden: options.guardForbidden }
  );
}

export function setByPathCore(
  obj: unknown,
  path: string,
  value: unknown,
  options: PathMutationOptions = {}
): void {
  const segments = splitPathCore(path, { filterEmpty: true });
  if (segments.length === 0) return;
  if (options.guardForbidden !== false) assertSafePathSegmentsCore(segments, path);

  let current = obj as Record<string, unknown>;
  const lastIndex = segments.length - 1;
  for (let i = 0; i < lastIndex; i++) {
    const segment = segments[i]!;
    const nextSegment = segments[i + 1];
    const shouldCreateArray = options.createArrays !== false && isNumericSegmentCore(nextSegment);
    const currentValue = current[segment];

    if (!isTraversable(currentValue)) {
      current[segment] = shouldCreateArray ? [] : {};
    } else if (shouldCreateArray && !Array.isArray(currentValue)) {
      current[segment] = [];
    }

    current = current[segment] as Record<string, unknown>;
  }

  const last = segments[lastIndex]!;
  if (Array.isArray(current) && isNumericSegmentCore(last)) {
    current[Number(last)] = value;
  } else {
    current[last] = value;
  }
}

export function pathExistsCore(obj: unknown, path: string, options: { guardForbidden?: boolean } = {}): boolean {
  if (!obj || typeof obj !== 'object' || !path) return false;
  const segments = splitPathCore(path);
  if (options.guardForbidden !== false && hasForbiddenPathSegmentCore(segments)) return false;

  let current: unknown = obj;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return false;
    if (Array.isArray(current) && isNumericSegmentCore(segment)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return false;
      current = current[index];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

export function getParentPathNormalizedCore(normalized: string): string | null {
  if (!isValidNormalizedPathCore(normalized)) return null;
  const index = normalized.lastIndexOf('.');
  return index === -1 ? null : normalized.slice(0, index);
}

export function getParentPathCore(path: string): string | null {
  if (!isValidPathCore(path)) return null;
  return getParentPathNormalizedCore(normalizePathCore(path));
}

export function getPathKeyCore(path: string): string | null {
  if (!isValidPathCore(path)) return null;
  const normalized = normalizePathCore(path);
  const index = normalized.lastIndexOf('.');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function nearestNumericContainerPathCore(path: string): string | null {
  if (!path) return null;
  const normalized = normalizePathCore(path);
  if (!isValidNormalizedPathCore(normalized)) return null;
  const parts = splitPathCore(normalized, { normalize: false }).filter(Boolean);
  const index = parts.findIndex((segment) => isNumericSegmentCore(segment));
  return index > 0 ? parts.slice(0, index).join('.') : null;
}

export function directNumericParentPathCore(path: string): string | null {
  if (!path) return null;
  const normalized = normalizePathCore(path);
  if (!isValidNormalizedPathCore(normalized)) return null;
  const parts = splitPathCore(normalized, { normalize: false }).filter(Boolean);
  const last = parts[parts.length - 1];
  return isNumericSegmentCore(last) && parts.length > 1 ? parts.slice(0, -1).join('.') : null;
}

export function resolveVersionPathCore(normalized: string, options: ResolveVersionPathOptions): string {
  if (options.dependencyMode === 'container') {
    const parent = getParentPathNormalizedCore(normalized);
    const base = parent ?? normalized;
    return options.bumpNumericParent ? nearestNumericContainerPathCore(base) ?? base : base;
  }
  return options.bumpNumericParent ? nearestNumericContainerPathCore(normalized) ?? normalized : normalized;
}

export function enumerateAncestorPathsCore(path: string, options: { includeNumericParent?: boolean } = {}): string[] {
  if (!path || typeof path !== 'string') return [];
  const normalized = normalizePathCore(path);
  if (!isValidNormalizedPathCore(normalized)) return [];
  const parts = splitPathCore(normalized, { normalize: false }).filter(Boolean);
  const out: string[] = [];
  for (let i = parts.length; i >= 1; i--) {
    out.push(parts.slice(0, i).join('.'));
  }
  if (options.includeNumericParent) {
    const parentPath = directNumericParentPathCore(normalized);
    if (parentPath && !out.includes(parentPath)) out.push(parentPath);
  }
  return out;
}

export function resolveParentAndKeyCore(obj: unknown, path: string): { parent: unknown; key: string | null; segments: string[] } {
  const segments = splitPathCore(path, { filterEmpty: true });
  if (segments.length === 0) return { parent: obj, key: null, segments };
  const key = segments[segments.length - 1]!;
  let parent: unknown = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    if (!isTraversable(parent)) return { parent: undefined, key, segments };
    parent = (parent as Record<string, unknown>)[segments[i]!];
  }
  return { parent, key, segments };
}

export function getParentSegmentsCore(segments: PathSegments): PathSegments {
  return !segments || segments.length <= 1 ? [] : segments.slice(0, -1);
}

export function ensurePathInCore(target: unknown, segments: PathSegments): unknown {
  let current = target as Record<string, unknown>;
  for (let i = 0; i < segments.length; i++) {
    if (!isTraversable(current)) return target;
    const segment = segments[i]!;
    const nextSegment = segments[i + 1];
    if (!isTraversable(current[segment])) {
      current[segment] = isNumericSegmentCore(nextSegment) ? [] : {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  return current;
}

export function cloneJsonCore<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}
