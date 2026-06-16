import { GenericProxyHandler } from './generic-proxy-handler.class';
import { IStoreInstance } from '../interfaces/store-instance.interface';
import { ProxyCallable } from '../interfaces/types';
import { StoreData } from '../types/advanced-types';
import { PathUtils } from '../utils/path-utils';
import type { Signal } from '@angular/core';

interface ProxyCacheEntry<T> {
  getSignalFromProxyCache?(p: string): Signal<T> | undefined;
  setSignalInProxyCache?(p: string, s: Signal<T>): void;
  registerRead?(p: string): void;
  registerReadNormalized?(p: string): void;
  isCollectingReads?(): boolean;
}

export interface CallableProxyOptions {
  strictInvalidPath?: boolean;
  strictDeleteUndefined?: boolean;
  setFn?: (path: string, value: unknown) => void;
  deleteFn?: (path: string) => void;
  cleanupFn?: () => void;
}

/**
 * Builds a "callable proxy" – function returning reactive/computed value
 * while still exposing deep property access with the same proxy logic.
 *
 * API pozostaje identyczne jak w poprzednim `ProxyMethods.createCallableProxy`.
 */
export function createCallableProxy<T>(
  nestedPath: string,
  storeInstance: IStoreInstance<StoreData>,
  nestedValue: T,
  nestedProxyFactory?: (path: string, value: unknown) => ProxyCallable<unknown>,
  options: CallableProxyOptions = {}
): ProxyCallable<T> {
  const serviceHost = storeInstance as unknown as {
    createService?: ProxyCacheEntry<T>;
    createServiceGetter?: ProxyCacheEntry<T>;
    getCreateService?: ProxyCacheEntry<T>;
  };
  const createService =
    serviceHost.createService ??
    serviceHost.createServiceGetter ??
    serviceHost.getCreateService;
  const isCollectingReads = createService?.isCollectingReads?.bind(createService);
  const registerRead = createService?.registerRead?.bind(createService);
  const registerReadNormalized = createService?.registerReadNormalized?.bind(createService);
  let normalizedReadPath: string | undefined;
  const getNormalizedReadPath = (): string => normalizedReadPath ??= PathUtils.normalizePath(nestedPath);
  const trackRead = (): void => {
    if (!isCollectingReads?.()) return;
    if (registerReadNormalized) {
      registerReadNormalized(getNormalizedReadPath());
      return;
    }
    registerRead?.(nestedPath);
  };

  // Lazily resolve and cache the Signal for this path (avoid repeated look-ups)
  let cachedSignal: Signal<T> | undefined;
  let cachedRead: (() => T) | undefined;
  const getSignalOnce = (): Signal<T> | undefined => {
    if (cachedSignal) return cachedSignal;
    // 1) Try proxy-level fast cache from CreateStoreService
    const fast = createService?.getSignalFromProxyCache?.(nestedPath);
    if (fast) {
      cachedSignal = fast as Signal<T>;
      return cachedSignal;
    }
    // 2) Fallback to store computed and save into proxy signal cache
    cachedSignal = (storeInstance as unknown as { getComputed: (p: string) => Signal<T> }).getComputed(nestedPath) as Signal<T>;
    if (cachedSignal && createService?.setSignalInProxyCache) {
      createService.setSignalInProxyCache(nestedPath, cachedSignal);
    }
    return cachedSignal;
  };
  const readValue = (): T | undefined => {
    trackRead();
    if (cachedRead) return cachedRead();
    const signal = getSignalOnce();
    if (!signal) return undefined;
    cachedRead = signal as unknown as () => T;
    return cachedRead();
  };

  // --- callable function ----------------------------------------------------
  const callable: ProxyCallable<T> = (() => {
    return readValue() as T;
  }) as ProxyCallable<T>;

  // Expose fast-path properties directly on callable to avoid store lookups in proxy handler
  try {
    Object.defineProperty(callable as unknown as object, '$signal', {
      get: () => getSignalOnce(),
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(callable as unknown as object, '$val', {
      get: () => readValue(),
      enumerable: false,
      configurable: true
    });
  } catch (e) {
    console.warn('CallableProxy defineProperty error:', e);
  }

  // --- proxy handler --------------------------------------------------------
  const handler: GenericProxyHandler<StoreData> = new GenericProxyHandler(storeInstance, {
    pathPrefix: nestedPath,
    exposeStoreMethods: false,
    originalNestedValue: nestedValue,
    resolveFn: (path) => {
      if (!path) return storeInstance.returnStore?.();
      return PathUtils.getByPath(storeInstance.returnStore?.(), path as string);
    },
    nestedProxyFactory: nestedProxyFactory || ((path, value): ProxyCallable<unknown> => createCallableProxy(path, storeInstance, value as unknown, undefined, options)),
    rxjsAllowedOnRoot: true,
    strictInvalidPath: !!options.strictInvalidPath,
    strictDeleteUndefined: !!options.strictDeleteUndefined,
    setFn: options.setFn,
    deleteFn: options.deleteFn,
    cleanupFn: options.cleanupFn,
  });

  const readCurrentValue = (): T | undefined => {
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
          } catch {
            return String(v);
          }
        };
      }
      if (key === 'valueOf') {
        return () => Object(readCurrentValue() as unknown);
      }
      if (key === 'toJSON') {
        return () => readCurrentValue();
      }
      if (key === Symbol.toPrimitive) {
        return (hint: string) => {
          const v = readCurrentValue();
          if (typeof v === 'object' || typeof v === 'function') {
            if (hint === 'number') return NaN;
            try { return JSON.stringify(v); } catch { return '[object Object]'; }
          }
          return v as unknown as string;
        };
      }
      return (baseGet as NonNullable<ProxyHandler<object>['get']>)(_target, key, receiver);
    },
    set: handler.createProxySetter(),
    deleteProperty: handler.createProxyDeleter(),
  }) as ProxyCallable<T>;
} 
