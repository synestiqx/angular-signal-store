import * as i0 from '@angular/core';
import { Provider } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

interface DevToolsAction {
    type: string;
    payload?: Record<string, unknown>;
    storeName?: string;
}
interface SetValuePayload {
    path: string;
    value: unknown;
    oldValue?: unknown;
}
interface ArrayOperationPayload {
    path: string;
    method: string;
    args: unknown[];
    oldValue: unknown[];
    newValue: unknown[];
}
interface StoreUpdatePayload {
    storeName: string;
    action: 'add' | 'remove' | 'update';
    path: string;
    keys: string[];
    snapshot?: Record<string, unknown>;
    graph?: unknown;
}
interface BehaviorStoreUpdatePayload extends StoreUpdatePayload {
    value?: unknown;
    currentState?: Record<string, BehaviorSubject<unknown>>;
}
interface VersionStoreUpdatePayload {
    path: string;
    action: 'add' | 'remove' | 'update';
    keys: string[];
    graph?: unknown;
}
interface ProxyMetricsPayload {
    path: string;
    hits: number;
    misses: number;
    hitRate: number;
    cacheSize: number;
    cacheDump: Array<{
        key: string;
        value: string;
    }>;
    cacheKeys: string[];
    graph?: unknown;
}
type StoreDevToolsAction = (DevToolsAction & {
    type: 'SET_VALUE';
    payload: SetValuePayload;
}) | (DevToolsAction & {
    type: 'SET_VALUE_OBSERVE';
    payload: SetValuePayload;
}) | (DevToolsAction & {
    type: 'ARRAY_OPERATION';
    payload: ArrayOperationPayload;
}) | (DevToolsAction & {
    type: 'COMPUTED_STORE_UPDATE';
    payload: StoreUpdatePayload;
}) | (DevToolsAction & {
    type: 'BEHAVIOR_STORE_UPDATE';
    payload: BehaviorStoreUpdatePayload;
}) | (DevToolsAction & {
    type: 'VERSION_STORE_UPDATE';
    payload: VersionStoreUpdatePayload;
}) | (DevToolsAction & {
    type: 'PROXY_METRICS';
    payload: ProxyMetricsPayload;
}) | (DevToolsAction & {
    type: 'UNSUBSCRIBE';
    payload: {
        path: string;
    };
}) | (DevToolsAction & {
    type: 'CLEANUP';
    payload: {
        path: string;
        cleanedPaths: string[];
        cleanedCount: number;
    };
});

type DevToolsEvent = StoreDevToolsAction & {
    storeName?: string;
};
interface AngularStoreDevtools {
    readonly action$: Observable<DevToolsEvent | null>;
    readonly readAction$: Observable<DevToolsEvent | null>;
    emitAction(event: DevToolsEvent): void;
    emitRead(event: DevToolsEvent): void;
    getBehaviorKeys(store: Record<string, unknown>): string[];
    getComputedKeys(store: Record<string, unknown>): string[];
}

declare class DevService implements AngularStoreDevtools {
    private actionSubject;
    private readActionSubject;
    action$: Observable<DevToolsEvent | null>;
    readAction$: Observable<DevToolsEvent | null>;
    constructor();
    emitAction(event: DevToolsEvent): void;
    emitRead(event: DevToolsEvent): void;
    setValue(path: string, value: unknown, oldValue?: unknown): void;
    setArrayOperation(path: string, method: string, args: unknown[], oldValue?: unknown, newValue?: unknown): void;
    logUnsubscribe(path: string): void;
    logCleanup(path: string, cleanedPaths: string[], cleanedCount: number): void;
    logProxyMetrics(metrics: {
        hits: number;
        misses: number;
        hitRate: number;
        cacheSize: number;
    }): void;
    computedStoreUpdate(storeName: string, operation: 'add' | 'remove' | 'update', key: string, keys: string[], snapshot?: Record<string, unknown>): void;
    behaviorStoreUpdate(storeName: string, operation: 'add' | 'remove' | 'update', key: string, keys: string[], value?: unknown, snapshot?: Record<string, unknown>): void;
    arrayOperation(storeName: string, path: string, method: string, args: unknown[], oldValue?: unknown, newValue?: unknown): void;
    arrayOperationUniversal(payload: {
        storeName?: string;
        method: string;
        path: string;
        oldValue?: unknown;
        newValue?: unknown;
        addedElements?: unknown[];
        removedElements?: unknown[];
        indexes?: number[];
        args?: unknown[];
    }): void;
    setValueObserve(storeName: string, path: string, value: unknown, oldValue?: unknown): void;
    getDisplayData(): Observable<DevToolsEvent | null>;
    createVisualizer(): void;
    private updateVisualizer;
    versionStoreUpdate(storeName: string, operation: 'add' | 'remove' | 'update', path: string, keys: string[], graph?: unknown): void;
    proxyMetrics(storeName: string, metrics: {
        hits: number;
        misses: number;
        hitRate: number;
        cacheSize: number;
        cacheDump?: Array<{
            key: string;
            value: string;
        }>;
        cacheKeys?: string[];
    }): void;
    behaviorSubscriptionStats(storeName: string, stats: {
        totalNodes?: number;
        activeSubscriptions?: number;
        inactiveNodes?: number;
        subscriptionDetails?: Array<{
            path: string;
            count: number;
            hasValue: boolean;
        }>;
    }): void;
    computedStoreUpdateWithSnapshot(storeName: string, operation: 'add' | 'remove' | 'update', path: string, keys: string[], snapshot?: Record<string, unknown>, graph?: unknown): void;
    behaviorStoreUpdateWithState(storeName: string, operation: 'add' | 'remove' | 'update', path: string, keys: string[], value?: unknown, currentState?: Record<string, BehaviorSubject<unknown>>, graph?: unknown): void;
    private emitActionAsync;
    /**
     * Get behavior subscription statistics for DevTools
     * @param behaviorStore - BehaviorSubject store from CreateStoreService
     * @param subscriptionCounts - Subscription count map from CreateStoreService
     */
    getBehaviorSubscriptionStats(behaviorStore: Record<string, BehaviorSubject<unknown>>, subscriptionCounts: Record<string, number>): {
        totalNodes: number;
        activeSubscriptions: number;
        inactiveNodes: number;
        subscriptionDetails: Array<{
            path: string;
            count: number;
            hasValue: boolean;
        }>;
    };
    /**
     * Get all behavior store keys for DevTools
     * @param behaviorStore - BehaviorSubject store from CreateStoreService
     */
    getBehaviorKeys(behaviorStore: Record<string, unknown>): string[];
    /**
     * Get all computed store keys for DevTools
     * @param computedStore - Computed signal store from CreateStoreService
     */
    getComputedKeys(computedStore: Record<string, unknown>): string[];
    static ɵfac: i0.ɵɵFactoryDeclaration<DevService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<DevService>;
}

declare function provideSignalStoreDevtools(): Provider;

export { DevService, provideSignalStoreDevtools };
export type { AngularStoreDevtools, DevToolsEvent };
//# sourceMappingURL=index.d.ts.map
