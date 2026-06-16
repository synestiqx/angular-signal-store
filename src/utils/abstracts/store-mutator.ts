import { PathUtils } from '../path-utils';
import { PathReader } from './path-reader';

/**
 * Unified store mutation engine.
 * Single responsibility: mutate store by path with auto-traversal.
 * Replaces duplicated mutation logic in CreateStore, PathUtils.setByPath, CursorManager, etc.
 */
export class StoreMutator {
  private readonly pathReader = new PathReader();

  constructor(
    private readonly bumpVersions: (path: string) => void,
    private readonly onAfterMutate?: (path: string, value: unknown) => void
  ) {}

  /**
   * Mutate store at path, creating intermediate objects/arrays as needed.
   */
  mutate(root: Record<string, unknown>, path: string, value: unknown): void {
    const normalized = PathUtils.normalizePath(path);
    const segments = this.pathReader.getSegments(normalized);
    if (segments.length === 0) return;

    const lastKey = segments[segments.length - 1]!;
    const parentSegments = segments.slice(0, -1);

    let parent: Record<string, unknown> = root;
    for (let i = 0; i < parentSegments.length; i++) {
      const key = parentSegments[i]!;
      const nextKey = parentSegments[i + 1] ?? lastKey;
      const isNextNumeric = /^\d+$/.test(nextKey);

      let child = parent[key];
      if (child === undefined || child === null) {
        child = isNextNumeric ? [] : {};
        parent[key] = child;
      } else if (isNextNumeric && !Array.isArray(child)) {
        child = [];
        parent[key] = child;
      }
      parent = child as Record<string, unknown>;
    }

    if (parent[lastKey] === value) return;
    parent[lastKey] = value;

    this.bumpVersions(normalized);
    this.onAfterMutate?.(normalized, value);
  }

  /**
   * Delete value at path (set undefined and clean up).
   */
  delete(root: Record<string, unknown>, path: string): void {
    const normalized = PathUtils.normalizePath(path);
    const segments = [...this.pathReader.getSegments(normalized)];
    if (segments.length === 0) return;

    const lastKey = segments.pop()!;
    let parent: unknown = root;
    for (const segment of segments) {
      if (parent == null || typeof parent !== 'object') return;
      parent = (parent as Record<string, unknown>)[segment];
    }
    if (parent == null || typeof parent !== 'object') return;

    if (Array.isArray(parent)) {
      const index = Number(lastKey);
      if (!Number.isNaN(index) && index >= 0 && index < parent.length) {
        parent.splice(index, 1);
      }
      return;
    }

    delete (parent as Record<string, unknown>)[lastKey];
    this.bumpVersions(normalized);
    this.onAfterMutate?.(normalized, undefined);
  }
}
