import type { Observable, OperatorFunction } from 'rxjs';
import { CreateStoreService } from '../core/create-store.core';

// Allowed RxJS methods exposed via proxy
const ALLOWED_METHODS = ['pipe', 'subscribe', 'toPromise', 'forEach'] as const;
type RxJSMethod = typeof ALLOWED_METHODS[number];

// Better-typed function shapes
type SubscribeFn<T = unknown> = (
  ...args: Parameters<Observable<T>['subscribe']>
) => ReturnType<Observable<T>['subscribe']>;

type PipeFn<T = unknown> = (
  ...operators: OperatorFunction<unknown, unknown>[]
) => Observable<unknown>;

type RxJSMethodFactory = (path: string, cacheKey: string) => Function;

export class RxJSBindingUtils {
  constructor(private createStoreService: CreateStoreService) {}

  // Lokalny cache metod, aby zwracane referencje były stabilne per path+method
  // Przechowujemy różne kształty funkcji, ale wystarczy ogólny Function
  private methodCache = new Map<string, Function>();
  private readonly methodFactories: Record<RxJSMethod, RxJSMethodFactory> = {
    subscribe: (path, cacheKey) => this.createSubscribeMethod(path, cacheKey),
    pipe: (path, cacheKey) => this.createPipeMethod(path, cacheKey),
    toPromise: (path, cacheKey) => this.createObservableMethod(path, 'toPromise', cacheKey),
    forEach: (path, cacheKey) => this.createObservableMethod(path, 'forEach', cacheKey)
  };

  private getTrackedObservable(path: string): Observable<unknown> {
    return this.createStoreService.getTrackedObservable(path) as Observable<unknown>;
  }

  // Overloads for stronger typing (storeName no longer needed)
  getRxJSMethod<TPath extends string, T = unknown>(path: TPath, method: 'subscribe'): SubscribeFn<T>;
  getRxJSMethod<TPath extends string, T = unknown>(path: TPath, method: 'pipe'): PipeFn<T>;
  getRxJSMethod<TPath extends string>(path: TPath, method: Exclude<RxJSMethod, 'subscribe' | 'pipe'>): (...args: unknown[]) => unknown;
  // Implementation signature (single implementation for all overloads)
  getRxJSMethod(path: string, method: string): Function {
    const factory = this.methodFactories[method as RxJSMethod];
    if (!factory) {
      throw new Error(`Method ${method} is not a supported RxJS Observable method.`);
    }

    const cacheKey = `${path}|${method}`;
    const cached = this.methodCache.get(cacheKey);
    if (cached) return cached as Function;

    return factory(path, cacheKey);
  }

  private createSubscribeMethod(path: string, cacheKey: string): Function {
    const wrappedSubscribe: SubscribeFn<unknown> = (...args) => {
      const observable = this.getTrackedObservable(path);
      return observable.subscribe(...args as Parameters<Observable<unknown>['subscribe']>);
    };
    this.methodCache.set(cacheKey, wrappedSubscribe);
    return wrappedSubscribe as unknown as Function;
  }

  private createPipeMethod(path: string, cacheKey: string): Function {
    const wrappedPipe: PipeFn<unknown> = (...operators: OperatorFunction<unknown, unknown>[]) => {
      return this.createStoreService.getObservableWithPipe(path, (obs: Observable<unknown>) => {
        return operators.reduce((acc, op) => (acc as Observable<unknown>).pipe(op as OperatorFunction<unknown, unknown>), obs as Observable<unknown>);
      });
    };
    this.methodCache.set(cacheKey, wrappedPipe);
    return wrappedPipe as unknown as Function;
  }

  private createObservableMethod(path: string, method: Exclude<RxJSMethod, 'subscribe' | 'pipe'>, cacheKey: string): Function {
    const observable = this.getTrackedObservable(path);
    const fn = this.createStoreService.getCachedObservableMethod(path, method, observable) as (...args: unknown[]) => unknown;
    this.methodCache.set(cacheKey, fn);
    return fn as unknown as Function;
  }
  
}
