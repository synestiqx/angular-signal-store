import { IStoreInstance } from '../interfaces/store-instance.interface';
import { StoreData, ArrayMutationMethod, ArrayQueryMethod, StrictPath } from '../types/advanced-types';
import { CreateStoreService } from '../core/create-store.core';
import { isArrayPath } from '../types/type-guards';
import { buildArrayQueryCacheKey } from './array-query-key.utils';

export type ArrayPredicate<T> = (value: T, index: number, array: T[]) => boolean;

export interface ProxyCacheEntry<T extends object> {
  [key: string]: WeakRef<T> | undefined;
}

type NormalizedMutationArgs = { value: unknown; extra: unknown[] };
type MutationArgNormalizer = (args: unknown[]) => NormalizedMutationArgs;
type FastArrayMutationStore<T extends StoreData> = IStoreInstance<T> & {
  setArrayMethodRef?: (
    path: string,
    arrayRef: unknown[],
    val: unknown,
    method: ArrayMutationMethod,
    ...args: unknown[]
  ) => unknown;
};

export class ArrayMethodHandler {
  private static readonly EMPTY_ARGS: unknown[] = [];
  private static readonly mutationArgNormalizers: Record<ArrayMutationMethod, MutationArgNormalizer> = {
    splice: (args) => ArrayMethodHandler.normalizeSpliceArgs(args),
    push: (args) => ArrayMethodHandler.normalizeVariadicArgs(args),
    unshift: (args) => ArrayMethodHandler.normalizeVariadicArgs(args),
    sort: (args) => ArrayMethodHandler.normalizeSingleArg(args),
    pop: () => ArrayMethodHandler.normalizeNoArgs(),
    shift: () => ArrayMethodHandler.normalizeNoArgs(),
    reverse: () => ArrayMethodHandler.normalizeNoArgs()
  };

  private static normalizeMutationArgs(keyStr: ArrayMutationMethod, args: unknown[]): { value: unknown; extra: unknown[] } {
    return ArrayMethodHandler.mutationArgNormalizers[keyStr](args);
  }

  private static normalizeSpliceArgs(args: unknown[]): NormalizedMutationArgs {
    const [start, deleteCount, ...items] = args;
    return { value: { start, deleteCount: args.length > 1 ? deleteCount : undefined, items }, extra: [] };
  }

  private static normalizeVariadicArgs(args: unknown[]): NormalizedMutationArgs {
    return args.length <= 1
      ? { value: args[0], extra: ArrayMethodHandler.EMPTY_ARGS }
      : { value: args[0], extra: args.slice(1) };
  }

  private static normalizeSingleArg(args: unknown[]): NormalizedMutationArgs {
    return { value: args[0], extra: ArrayMethodHandler.EMPTY_ARGS };
  }

  private static normalizeNoArgs(): NormalizedMutationArgs {
    return { value: undefined, extra: ArrayMethodHandler.EMPTY_ARGS };
  }

  static createMutatingMethod<T extends StoreData, R = unknown>(
    keyStr: ArrayMutationMethod,
    targetPath: string,
    storeInstance: IStoreInstance<T>,
    afterMutation?: () => void,
    arrayRef?: unknown[]
  ): (...args: unknown[]) => R | undefined {
    return function (this: unknown, ...args: unknown[]) {
      const calledAsMethod = this !== undefined && this !== globalThis;
      return ArrayMethodHandler.executeMutatingMethod<T, R>(
        keyStr,
        targetPath,
        storeInstance,
        args,
        afterMutation,
        calledAsMethod ? arrayRef : undefined
      );
    }
  }

  static executeMutatingMethod<T extends StoreData, R = unknown>(
    keyStr: ArrayMutationMethod,
    targetPath: string,
    storeInstance: IStoreInstance<T>,
    args: unknown[],
    afterMutation?: () => void,
    arrayRef?: unknown[]
  ): R | undefined {
    if ((keyStr === 'push' || keyStr === 'unshift') && args.length === 0) {
      const current = arrayRef ?? storeInstance.readStore?.(targetPath);
      return (Array.isArray(current) ? current.length : undefined) as R | undefined;
    }
    const { value, extra } = ArrayMethodHandler.normalizeMutationArgs(keyStr, args);
    let result: unknown;
    const fastStore = storeInstance as FastArrayMutationStore<T>;

    if (arrayRef && fastStore.setArrayMethodRef) {
      result = fastStore.setArrayMethodRef(targetPath, arrayRef, value, keyStr, ...extra);
    } else if (ArrayMethodHandler.isValidArrayPath<T>(storeInstance, targetPath)) {
      result = storeInstance.setArrayMethod(targetPath as StrictPath<T>, value as never, keyStr, ...extra);
    }

    afterMutation?.();

    return result as R | undefined;
  }

  static createQueryMethod<T extends StoreData, R extends object = Record<string, unknown>>(
    keyStr: ArrayQueryMethod,
    targetPath: string,
    storeInstance: IStoreInstance<T>,
    cache?: ProxyCacheEntry<R>
  ): (...args: unknown[]) => R | undefined {
    return (...args: unknown[]) => {
      const firstArg = args[0];
      if (!ArrayMethodHandler.isValidArrayPath<T>(storeInstance, targetPath)) {
        return undefined;
      }

      // Build a stable cache key using shared util
      const cacheKey = buildArrayQueryCacheKey(targetPath, keyStr, firstArg, args.slice(1));

      if (cache) {
        const ref = cache[cacheKey];
        const cached = ref?.deref?.();
        if (cached) {
          return cached as R;
        }
      }

      // Prefer createService-based computed (reactive), which is memoized under path
      const createService = (storeInstance as { getCreateService?: CreateStoreService }).getCreateService;
      let result: R | undefined;
      if (createService && typeof createService.createArrayQueryComputed === 'function') {
        result = createService.createArrayQueryComputed(targetPath, keyStr, firstArg, ...args.slice(1)) as R;
      } else {
        // Fallback: non-reactive query
        result = storeInstance.queryArray(targetPath as StrictPath<T>, firstArg as never, keyStr as never, ...args.slice(1)) as R;
      }

      if (cache && result !== undefined) {
        try {
          cache[cacheKey] = new WeakRef(result);
        } catch {
          // ignore environments without WeakRef support
        }
      }

      return result;
    };
  }

  /**
   * Type guard to validate array paths
   */
  static isValidArrayPath<T extends StoreData>(
    storeInstance: IStoreInstance<T>, 
    path: string
  ): path is StrictPath<T> {
    return isArrayPath(storeInstance, path);
  }
}
