import { PathUtils } from '../path-utils';

/**
 * Universal path traversal engine.
 * Eliminates duplicated path-reading logic across:
 * - PathUtils.getByPath
 * - CreateStoreService.fastReadBySegments
 * - ProxyFactory.getValueIteratively
 * - BaseProxyHandler.resolveValue
 */
export class PathReader {
  /**
   * Read a value by path from an object root.
   * SSOT for all store reads.
   */
  read<T = unknown>(root: Record<string, unknown> | undefined, path: string): T | undefined {
    if (!root || !path) return undefined;
    const segments = this.getSegments(path);
    return this.readBySegments(root, segments) as T | undefined;
  }

  /**
   * Fast read using pre-split segments.
   */
  readBySegments(root: Record<string, unknown> | undefined, segments: readonly string[]): unknown {
    if (!root || segments.length === 0) return root;
    let current: unknown = root;
    for (const segment of segments) {
      if (current == null) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  /**
   * Get cached segments for a path.
   */
  getSegments(path: string): readonly string[] {
    const normalized = PathUtils.normalizePath(path);
    if (!normalized) return [];
    return PathUtils.splitNormalizedPath(normalized);
  }
}
