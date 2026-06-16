import { computed, type Signal, type WritableSignal } from '@angular/core';
import type { CreateStoreService } from '../create-store.core';
import { PathUtils } from '../../utils/path-utils';
import { FlatStoreMap } from '../../utils/flat-store-map';
import { BaseManager } from './base.manager';
import { buildMethodHashSegment } from '../../utils/array-query-key.utils';
import { executeArrayQuery } from '../../utils/array-query-executor';
import type {
  StoreData,
  ValidPath,
  ArrayQueryMethod,
  ArrayElement,
  PredicateFn,
  MapFn,
  ReduceFn,
  PathValue
} from '../../types/advanced-types';

type ArrayQueryResult<E, M extends ArrayQueryMethod | 'length'> =
  M extends 'find' ? E | undefined :
  M extends 'findIndex' | 'indexOf' ? number :
  M extends 'filter' | 'map' ? E[] :
  M extends 'some' | 'every' | 'includes' ? boolean :
  M extends 'reduce' ? unknown :
  M extends 'length' ? number :
  unknown;

type ArrayQueryPredicate<E, M extends ArrayQueryMethod | 'length'> =
  M extends 'find' | 'findIndex' | 'filter' | 'some' | 'every' ? PredicateFn<E> :
  M extends 'map' ? MapFn<E, unknown> :
  M extends 'reduce' ? ReduceFn<E, unknown> :
  M extends 'includes' | 'indexOf' ? E :
  undefined;

/**
 * Manages computed signals graph for a single store instance.
 * Refactored with BaseManager and FlatStoreMap for optimal performance.
 */
export class ComputedService<TStore extends StoreData = StoreData> extends BaseManager<TStore> {
  private computedStore = new FlatStoreMap<Signal<unknown>>();

  constructor(core: CreateStoreService<TStore>, storeName: string) {
    super(core, storeName);
  }

  // --- public API used by core ---
  get<T>(path: ValidPath<TStore> & string): Signal<T> | undefined {
    const existing = this.computedStore.get(path);
    if (existing) return existing as Signal<T>;
    this.add(path);
    return this.computedStore.get(path) as Signal<T> | undefined;
  }

  add(path: ValidPath<TStore> & string): void {
    if (!super.pathHasValue(path)) return;
    if (this.computedStore.has(path)) return;

    const normalizedPath = this.normalizePath(path);

    const pathSegments = this.core.getPathSegments(normalizedPath);
    let cachedVersionPath: string | undefined;
    let versionRef: WritableSignal<number> | undefined;
    const s = computed(() => {
      const versionPath = this.core.resolveVersionPathNormalized(normalizedPath);
      if (!versionRef || cachedVersionPath !== versionPath) {
        versionRef = this.core.getVersion(versionPath);
        cachedVersionPath = versionPath;
      }
      versionRef!();
      const value = this.core.fastReadBySegments(this.storeRef, pathSegments);
      if (this.core.getCloneComputedOutputs()) {
        if (value && typeof value === 'object') {
          return Array.isArray(value) ? [...(value as unknown[])] : { ...(value as Record<string, unknown>) };
        }
      }
      return value;
    });
    this.core.setSignalInProxyCache(normalizedPath, s as unknown as Signal<unknown>);
    this.computedStore.set(normalizedPath, s);
  }

  remove(path: string): void {
    this.computedStore.deleteByPrefix(path);
  }

  cleanup(pathPrefix?: string): void {
    if (!pathPrefix) {
      this.computedStore.clear();
    } else {
      this.computedStore.deleteByPrefix(pathPrefix);
    }
  }

  isExists(path: string): boolean {
    return this.computedStore.has(path);
  }

  keys(): string[] {
    return this.computedStore.keys();
  }

  store(): Record<string, Signal<unknown>> {
    return this.computedStore.toObject();
  }

  // Array query computed
  createArrayQueryComputed<
    P extends ValidPath<TStore> & string,
    M extends ArrayQueryMethod | 'length',
    A = PathValue<TStore, P>,
    E = ArrayElement<A>,
    R = ArrayQueryResult<E, M>
  >(
    path: P,
    method: M,
    predicate: ArrayQueryPredicate<E, M>,
    ...args: unknown[]
  ): Signal<R> | undefined {
    const normalizedPath = this.normalizePath(path);
    const baseSegments = Array.from(this.core.getPathSegments(normalizedPath));
    if (!super.pathHasValue(normalizedPath)) return undefined;

    const keySegment = buildMethodHashSegment(method, predicate, args);
    const fullPath = [...baseSegments, '$arrayQuery', keySegment].join('.');

    const existing = this.computedStore.get(fullPath);
    if (existing) return existing as Signal<R>;

    const pathSegments = this.core.getPathSegments(normalizedPath);
    let cachedVersionPath: string | undefined;
    let versionRef: WritableSignal<number> | undefined;
    const s = computed(() => {
      const versionPath = this.core.resolveVersionPathNormalized(normalizedPath);
      if (!versionRef || cachedVersionPath !== versionPath) {
        versionRef = this.core.getVersion(versionPath);
        cachedVersionPath = versionPath;
      }
      versionRef!();
      const arrayRef = this.core.fastReadBySegments(this.storeRef, pathSegments);
      if (!Array.isArray(arrayRef)) return undefined;
      try {
        return this.safeArrayQuery<E, M>(arrayRef as E[], predicate, method, ...args) as R;
      } catch (e) {
        console.warn('ComputedService array query error:', e);
        return undefined;
      }
    });
    this.core.setSignalInProxyCache(fullPath, s as unknown as Signal<unknown>);
    this.computedStore.set(fullPath, s);

    this.emitDevTools({
      type: 'COMPUTED_STORE_UPDATE',
      payload: { storeName: this.storeName, action: 'add', path: fullPath, keys: this.keys() }
    });

    return this.computedStore.get(fullPath) as Signal<R>;
  }

  registerPipelineComputed(path: string, signalRef: Signal<unknown>): void {
    if (!signalRef) return;
    const normalizedPath = this.normalizePath(path);
    const existed = this.computedStore.has(normalizedPath);
    this.computedStore.set(normalizedPath, signalRef);
    this.core.setSignalInProxyCache(normalizedPath, signalRef);

    const operation: 'add' | 'update' = existed ? 'update' : 'add';
    this.emitDevTools({
      type: 'COMPUTED_STORE_UPDATE',
      payload: { storeName: this.storeName, action: operation, path: normalizedPath, keys: this.keys() }
    });
  }

  private safeArrayQuery<E, M extends ArrayQueryMethod | 'length'>(
    arrayRef: E[],
    predicate: ArrayQueryPredicate<E, M>,
    method: M,
    ...args: unknown[]
  ): ArrayQueryResult<E, M> {
    try {
      return executeArrayQuery(arrayRef, method, predicate, args, { cloneFoundObject: true }) as ArrayQueryResult<E, M>;
    } catch {
      return undefined as ArrayQueryResult<E, M>;
    }
  }

  // Auto-tracked multi-path computed
  createAutoTrackedComputed<T = unknown>(pathKey: string, derive: (get: (path: string) => unknown) => T): Signal<T> {
    const full = this.getAutoComputedKey(pathKey);
    const existing = this.computedStore.get(full) as Signal<T> | undefined;
    if (existing) return existing;

    const computedSignal = !this.core.getTrackReads()
      ? computed(() => {
          const base = this.core.resolveVersionPathNormalized(PathUtils.normalizePath(pathKey));
          this.core.getVersion(base)();
          const result = derive((p: string) =>
            PathUtils.getByPath(this.storeRef as Record<string, unknown>, PathUtils.normalizePath(p))
          );
          if (result && typeof result === 'object') {
            return (Array.isArray(result) ? [...(result as unknown[])] : { ...(result as Record<string, unknown>) }) as T;
          }
          return result;
        })
      : (() => {
          const depRefs = new Map<string, WritableSignal<number>>();
          return computed(() => {
            this.core.startCollect();
            const get = (path: string): unknown => {
              const n = PathUtils.normalizePath(path);
              this.core.registerRead(n);
              return PathUtils.getByPath(this.storeRef as Record<string, unknown>, n);
            };
            const result = derive(get);
            const collected = this.core.stopCollect() || new Set<string>();
            const newDeps = new Set<string>();
            if (collected.size > 0) {
              for (const p of collected) {
                const normalized = PathUtils.normalizePath(p);
                const base = this.core.resolveVersionPathNormalized(normalized);
                newDeps.add(base);
                const directParent = this.core.getBumpNumericParent()
                  ? PathUtils.directNumericParentPath(normalized)
                  : null;
                if (directParent) newDeps.add(directParent);
              }
            }
            for (const d of newDeps) {
              if (!depRefs.has(d)) depRefs.set(d, this.core.getVersion(d));
            }
            for (const key of Array.from(depRefs.keys())) {
              if (!newDeps.has(key)) depRefs.delete(key);
            }
            depRefs.forEach((ref) => ref());
            if (result && typeof result === 'object') {
              return (Array.isArray(result) ? [...(result as unknown[])] : { ...(result as Record<string, unknown>) }) as T;
            }
            return result;
          });
        })();

    try {
      this.core.setSignalInProxyCache(full, computedSignal as unknown as Signal<unknown>);
    } catch (e) {
      console.warn('ComputedService setSignalInProxyCache error:', e);
    }

    this.computedStore.set(full, computedSignal as Signal<unknown>);
    return computedSignal as Signal<T>;
  }

  getAutoComputed<T = unknown>(pathKey: string): Signal<T> | undefined {
    const key = this.getAutoComputedKey(pathKey);
    return (this.computedStore.get(key) as Signal<T>) || undefined;
  }

  deleteAutoComputed(pathKey: string): void {
    const key = this.getAutoComputedKey(pathKey);
    this.remove(key);
  }

  private getAutoComputedKey(pathKey: string): string {
    const keySegments = Array.from(this.core.getPathSegments(pathKey));
    return ['$autoComputed', ...keySegments].join('.');
  }
}
