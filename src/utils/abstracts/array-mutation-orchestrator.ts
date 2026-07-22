import { PathUtils } from '../path-utils';

export type ArrayMutationMethod = 'push' | 'unshift' | 'pop' | 'shift' | 'splice' | 'sort' | 'reverse';

export interface SpliceOperation {
  start: number;
  deleteCount?: number;
  items: unknown[];
}

type ArrayMutationHandler = (arrayRef: unknown[], payload: unknown) => unknown;
type InvalidationStartHandler = (payload: unknown, array: unknown[]) => number | null;

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
export class ArrayMutationOrchestrator {
  private readonly mutationHandlers: Record<ArrayMutationMethod, ArrayMutationHandler> = {
    push: (arrayRef, payload) => this.applyPush(arrayRef, payload),
    unshift: (arrayRef, payload) => this.applyUnshift(arrayRef, payload),
    pop: (arrayRef) => this.applyPop(arrayRef),
    shift: (arrayRef) => this.applyShift(arrayRef),
    sort: (arrayRef, payload) => this.applySort(arrayRef, payload),
    reverse: (arrayRef) => this.applyReverse(arrayRef),
    splice: (arrayRef, payload) => this.applySplice(arrayRef, payload)
  };

  private readonly invalidationStartHandlers: Record<ArrayMutationMethod, InvalidationStartHandler> = {
    push: () => null,
    pop: (_payload, array) => array.length - 1,
    shift: () => 0,
    reverse: () => 0,
    sort: () => 0,
    unshift: () => 0,
    splice: (payload, array) => this.computeSpliceInvalidationStart(payload, array.length)
  };

  constructor(
    private readonly wakeUpVersionPath: (path: string) => void,
    private readonly wakeUpArrayMutation: (path: string, value: unknown, afterVersion?: () => void) => void,
    private readonly clearProxyCacheForPath: (path: string) => void,
    private readonly cleanupBehaviorStore?: (path: string) => void,
    private readonly cleanupComputedStore?: (path: string) => void,
    private readonly cleanupVersionStore?: (path: string) => void,
    private readonly deleteIndexedProxyCacheRange?: (arrayPath: string, startIndex: number, endIndex: number) => void,
    private readonly hasIndexedProxyCacheFrom?: (arrayPath: string, startIndex: number) => boolean,
    private readonly hasIndexedDerivedNodeFrom?: (arrayPath: string, startIndex: number) => boolean
  ) {}

  mutate(
    arrayPath: string,
    arrayRef: unknown[],
    method: ArrayMutationMethod,
    payload: unknown
  ): { oldLength: number; newLength: number; proxyInvalidationStart: number | null; result: unknown } {
    const oldLength = arrayRef.length;
    const proxyInvalidationStart = this.computeInvalidationStart(method, payload, arrayRef);
    const result = this.mutationHandlers[method](arrayRef, payload);

    const newLength = arrayRef.length;

    this.finalizeArrayChange(arrayPath, arrayRef, oldLength, newLength, proxyInvalidationStart);

    return { oldLength, newLength, proxyInvalidationStart, result };
  }

  updateItem(arrayPath: string, arrayRef: unknown[], index: number, newValue: unknown): void {
    if (index < 0 || index >= arrayRef.length) {
      throw new Error(`Index ${index} out of bounds for array at ${arrayPath}`);
    }
    arrayRef[index] = newValue;
    const elementPath = `${arrayPath}.${index}`;
    this.wakeUpArrayMutation(elementPath, newValue);
  }

  deleteByIndex(arrayPath: string, arrayRef: unknown[], index: number): void {
    const oldLength = arrayRef.length;
    if (index < 0 || index >= arrayRef.length) {
      this.wakeUpVersionPath(arrayPath);
      return;
    }
    arrayRef.splice(index, 1);
    const newLength = arrayRef.length;
    this.finalizeArrayChange(arrayPath, arrayRef, oldLength, newLength, index);
  }

  finalizeArrayChange(
    arrayPath: string,
    value: unknown,
    oldLength: number,
    newLength: number,
    proxyInvalidationStart: number | null
  ): void {
    this.wakeUpArrayMutation(arrayPath, value, () => {
      if (proxyInvalidationStart !== null && this.shouldClearIndexedProxyCache(arrayPath, proxyInvalidationStart)) {
        this.invalidateProxyRange(arrayPath, proxyInvalidationStart, oldLength);
      }
      this.cleanupRemovedTailIndices(arrayPath, oldLength, newLength);
    });
  }

  private computeInvalidationStart(
    method: ArrayMutationMethod,
    payload: unknown,
    array: unknown[]
  ): number | null {
    if (!array.length) return null;
    return this.invalidationStartHandlers[method](payload, array);
  }

  private applyPush(arrayRef: unknown[], payload: unknown): number {
    const items = payload as unknown[];
    return items.length === 1 ? arrayRef.push(items[0]) : arrayRef.push(...items);
  }

  private applyUnshift(arrayRef: unknown[], payload: unknown): number {
    const items = payload as unknown[];
    return items.length === 1 ? arrayRef.unshift(items[0]) : arrayRef.unshift(...items);
  }

  private applyPop(arrayRef: unknown[]): unknown {
    return arrayRef.pop();
  }

  private applyShift(arrayRef: unknown[]): unknown {
    return arrayRef.shift();
  }

  private applySort(arrayRef: unknown[], payload: unknown): unknown[] {
    return arrayRef.sort(payload as (a: unknown, b: unknown) => number);
  }

  private applyReverse(arrayRef: unknown[]): unknown[] {
    return arrayRef.reverse();
  }

  private applySplice(arrayRef: unknown[], payload: unknown): unknown[] {
    const op = payload as SpliceOperation;
    return op.deleteCount === undefined
      ? arrayRef.splice(op.start)
      : arrayRef.splice(op.start, op.deleteCount, ...op.items);
  }

  private computeSpliceInvalidationStart(payload: unknown, length: number): number | null {
    const op = payload as SpliceOperation;
    const start = this.normalizeSpliceStart(op.start, length);
    const deleteCount = op.deleteCount ?? Math.max(0, length - start);
    if (deleteCount <= 0 && op.items.length <= 0) return null;
    if (start >= length && deleteCount <= 0) return null;
    return start;
  }

  private normalizeSpliceStart(start: number, arrayLength: number): number {
    if (start < 0) return Math.max(arrayLength + start, 0);
    return Math.min(start, arrayLength);
  }

  invalidateProxyRange(arrayPath: string, startIndex: number, oldLength: number): void {
    if (startIndex < 0 || startIndex >= oldLength) return;
    if (this.deleteIndexedProxyCacheRange) {
      this.deleteIndexedProxyCacheRange(arrayPath, startIndex, oldLength);
      return;
    }
    for (let i = startIndex; i < oldLength; i++) {
      this.clearProxyCacheForPath(`${arrayPath}.${i}`);
    }
  }

  cleanupRemovedTailIndices(arrayPath: string, oldLength: number, newLength: number): void {
    if (oldLength <= newLength) return;
    const shouldClearProxyCache = this.shouldClearIndexedProxyCache(arrayPath, newLength);
    const shouldCleanupDerived = this.shouldCleanupIndexedDerivedNodes(arrayPath, newLength);
    if (!shouldClearProxyCache && !shouldCleanupDerived) return;
    if (shouldClearProxyCache) this.invalidateProxyRange(arrayPath, newLength, oldLength);
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

  private shouldClearIndexedProxyCache(arrayPath: string, startIndex: number): boolean {
    return this.hasIndexedProxyCacheFrom ? this.hasIndexedProxyCacheFrom(arrayPath, startIndex) : true;
  }

  private shouldCleanupIndexedDerivedNodes(arrayPath: string, startIndex: number): boolean {
    return this.hasIndexedDerivedNodeFrom ? this.hasIndexedDerivedNodeFrom(arrayPath, startIndex) : true;
  }
}
