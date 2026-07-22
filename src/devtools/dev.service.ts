import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { DevToolsEvent } from '../core/signal-store.service';
import type { AngularStoreDevtools } from '../core/devtools-contract';
import type { StoreDevToolsAction } from './types';

// Use the canonical StoreDevToolsAction shape everywhere
type DevAction = StoreDevToolsAction;

@Injectable({
  providedIn: 'root'
})
export class DevService implements AngularStoreDevtools {
  // Dedicated devtools bus (no nulls exposed)
  private actionSubject = new BehaviorSubject<DevToolsEvent | null>(null);
  private readActionSubject = new BehaviorSubject<DevToolsEvent | null>(null);

  public action$: Observable<DevToolsEvent | null> = this.actionSubject.asObservable();
  public readAction$: Observable<DevToolsEvent | null> = this.readActionSubject.asObservable();

  constructor() {}

  // Explicit emitters to avoid leaking subjects
  emitAction(event: DevToolsEvent) {
    this.actionSubject.next(event);
  }
  emitRead(event: DevToolsEvent) {
    this.readActionSubject.next(event);
  }
  
  setValue(path: string, value: unknown, oldValue?: unknown) {
    const action: StoreDevToolsAction = {
      type: 'SET_VALUE',
      payload: {
        path,
        value,
        oldValue
      }
    };
    
    this.actionSubject.next(action);
  }
  
  setArrayOperation(path: string, method: string, args: unknown[], oldValue?: unknown, newValue?: unknown) {
    const action: StoreDevToolsAction = {
      type: 'ARRAY_OPERATION',
      payload: {
        path,
        method,
        args,
        oldValue: (oldValue as unknown[]) ?? [],
        newValue: (newValue as unknown[]) ?? []
      }
    };
    
    this.actionSubject.next(action);
  }
  
  logUnsubscribe(path: string) {
    const action: StoreDevToolsAction = {
      type: 'UNSUBSCRIBE',
      payload: {
        path,
      }
    };
    
    this.actionSubject.next(action);
  }

  logCleanup(path: string, cleanedPaths: string[], cleanedCount: number) {
    const action: StoreDevToolsAction = {
      type: 'CLEANUP',
      payload: {
        path,
        cleanedPaths,
        cleanedCount
      }
    };
    
    this.actionSubject.next(action);
  }

  logProxyMetrics(metrics: { hits: number; misses: number; hitRate: number; cacheSize: number }) {
    const action: StoreDevToolsAction = {
      type: 'PROXY_METRICS',
      payload: {
        path: 'proxy-cache',
        hits: metrics.hits,
        misses: metrics.misses,
        hitRate: metrics.hitRate,
        cacheSize: metrics.cacheSize,
        cacheDump: [],
        cacheKeys: []
      }
    };
    
    this.actionSubject.next(action);
  }

  // Computed Store actions
  computedStoreUpdate(storeName: string, operation: 'add' | 'remove' | 'update', key: string, keys: string[], snapshot?: Record<string, unknown>) {
    const action: StoreDevToolsAction = {
      type: 'COMPUTED_STORE_UPDATE',
      payload: {
        storeName,
        action: operation,
        path: key,
        keys,
        snapshot
      }
    };
    
    this.actionSubject.next(action);
  }

  // Behavior Store actions
  behaviorStoreUpdate(storeName: string, operation: 'add' | 'remove' | 'update', key: string, keys: string[], value?: unknown, snapshot?: Record<string, unknown>) {
    const action: StoreDevToolsAction = {
      type: 'BEHAVIOR_STORE_UPDATE',
      payload: {
        storeName,
        action: operation,
        path: key,
        keys,
        value,
        snapshot
      }
    };
    
    this.actionSubject.next(action);
  }

  // Array operations
  arrayOperation(storeName: string, path: string, method: string, args: unknown[], oldValue?: unknown, newValue?: unknown) {
    const action: StoreDevToolsAction = {
      type: 'ARRAY_OPERATION',
      payload: {
        storeName,
        path,
        method,
        args,
        oldValue: (oldValue as unknown[]) ?? [],
        newValue: (newValue as unknown[]) ?? []
      }
    };
    
    this.actionSubject.next(action);
  }

  // Universal array operation handler
  arrayOperationUniversal(payload: { storeName?: string; method: string; path: string; oldValue?: unknown; newValue?: unknown; addedElements?: unknown[]; removedElements?: unknown[]; indexes?: number[]; args?: unknown[] }) {
    // Rozpoznaj szczegóły operacji
    const { storeName, method, path, oldValue, newValue, addedElements, removedElements, indexes, args } = payload;
    const action: StoreDevToolsAction = {
      type: 'ARRAY_OPERATION',
      payload: {
        storeName,
        path,
        method,
        args: args ?? [],
        oldValue: (oldValue as unknown[]) ?? [],
        newValue: (newValue as unknown[]) ?? [],
        added: addedElements,
        removed: removedElements,
        indexes
      }
    };
    this.actionSubject.next(action);
  }

  // Set value observe
  setValueObserve(storeName: string, path: string, value: unknown, oldValue?: unknown) {
    const action: StoreDevToolsAction = {
      type: 'SET_VALUE_OBSERVE',
      payload: {
        storeName,
        path,
        value,
        oldValue
      }
    };
    
    this.actionSubject.next(action);
  }

  getDisplayData() {
    return this.readAction$;
  }

  createVisualizer() {
    if (typeof window === 'undefined') return;

    // If the DevTools panel is already rendered in an Angular template
    // (e.g. <app-dev-tools> added in app.html) we should not try to recreate
    // it – removing it causes Angular to destroy the component and the
    // dynamically added element will not be bootstrapped automatically.
    const existingPanel = document.querySelector('app-dev-tools');
    if (existingPanel) {
      // Panel already present – nothing to do
      return;
    }

    // Otherwise create a host element for the DevTools component.
    // Note: A standalone component present in the `imports` of the root
    // component will be bootstrapped automatically if its element exists
    // before change-detection runs, so creating it here is sufficient.
    const component = document.createElement('app-dev-tools');
    document.body.appendChild(component);
  }

  // Legacy method for compatibility
  private updateVisualizer() {
    // No longer needed - handled by Angular component
  }
  
  // Removed updateVisualizer - now handled by Angular component

  // Version Store updates
  versionStoreUpdate(storeName: string, operation: 'add' | 'remove' | 'update', path: string, keys: string[], graph?: unknown) {
    const action: StoreDevToolsAction = {
      type: 'VERSION_STORE_UPDATE',
      payload: {
        storeName,
        action: operation,
        path,
        keys,
        graph
      }
    };
    this.emitAction({ ...action, storeName });
  }

  // Proxy metrics with full details
  proxyMetrics(storeName: string, metrics: { hits: number; misses: number; hitRate: number; cacheSize: number; cacheDump?: Array<{ key: string; value: string }>; cacheKeys?: string[] }) {
    const action: StoreDevToolsAction = {
      type: 'PROXY_METRICS',
      payload: {
        path: 'proxy-cache',
        ...metrics,
        cacheDump: metrics.cacheDump ?? [],
        cacheKeys: metrics.cacheKeys ?? []
      }
    };
    this.emitAction({ ...action, storeName });
  }

  // Behavior subscription stats
  behaviorSubscriptionStats(storeName: string, stats: { totalNodes?: number; activeSubscriptions?: number; inactiveNodes?: number; subscriptionDetails?: Array<{ path: string; count: number; hasValue: boolean }> }) {
    const action: StoreDevToolsAction = {
      type: 'BEHAVIOR_STORE_UPDATE',
      payload: {
        storeName,
        action: 'update',
        path: 'behavior-subscriptions',
        keys: [],
        ...stats,
        graph: undefined
      }
    };
    this.emitAction({ ...action, storeName });
  }

  // Computed store update with snapshot
  computedStoreUpdateWithSnapshot(storeName: string, operation: 'add' | 'remove' | 'update', path: string, keys: string[], snapshot?: Record<string, unknown>, graph?: unknown) {
    const action: StoreDevToolsAction = {
      type: 'COMPUTED_STORE_UPDATE',
      payload: {
        storeName,
        action: operation,
        path,
        keys,
        snapshot,
        graph
      }
    };
    this.emitActionAsync({ ...action, storeName });
  }

  // Behavior store update with current state
  behaviorStoreUpdateWithState(storeName: string, operation: 'add' | 'remove' | 'update', path: string, keys: string[], value?: unknown, currentState?: Record<string, BehaviorSubject<unknown>>, graph?: unknown) {
    const action: StoreDevToolsAction = {
      type: 'BEHAVIOR_STORE_UPDATE',
      payload: {
        storeName,
        action: operation,
        path,
        keys,
        value,
        currentState,
        graph
      }
    };
    this.emitActionAsync({ ...action, storeName });
  }

  // Emit action in microtask (non-blocking)
  private emitActionAsync(event: DevToolsEvent) {
    queueMicrotask(() => this.emitAction(event));
  }

  // ===== STATS METHODS (moved from CreateStoreService) =====
  // These methods are only used by DevTools and should be in DevService

  /**
   * Get behavior subscription statistics for DevTools
   * @param behaviorStore - BehaviorSubject store from CreateStoreService
   * @param subscriptionCounts - Subscription count map from CreateStoreService
   */
  getBehaviorSubscriptionStats(
    behaviorStore: Record<string, BehaviorSubject<unknown>>,
    subscriptionCounts: Record<string, number>
  ): {
    totalNodes: number;
    activeSubscriptions: number;
    inactiveNodes: number;
    subscriptionDetails: Array<{ path: string; count: number; hasValue: boolean }>
  } {
    const details: Array<{ path: string; count: number; hasValue: boolean }> = [];

    const keys = Object.keys(behaviorStore);
    for (const k of keys) {
      const count = subscriptionCounts[k] || 0;
      const hasValue = !!behaviorStore[k];
      details.push({ path: k, count, hasValue });
    }

    return {
      totalNodes: details.length,
      activeSubscriptions: details.reduce((sum, d) => sum + d.count, 0),
      inactiveNodes: details.filter(d => d.count === 0).length,
      subscriptionDetails: details
    };
  }

  /**
   * Get all behavior store keys for DevTools
   * @param behaviorStore - BehaviorSubject store from CreateStoreService
   */
  getBehaviorKeys(behaviorStore: Record<string, unknown>): string[] {
    return Object.keys(behaviorStore);
  }

  /**
   * Get all computed store keys for DevTools
   * @param computedStore - Computed signal store from CreateStoreService
   */
  getComputedKeys(computedStore: Record<string, unknown>): string[] {
    return Object.keys(computedStore);
  }
}
