import * as i0 from '@angular/core';
import { InjectionToken, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const SIGNAL_STORE_DEVTOOLS = new InjectionToken('SIGNAL_STORE_DEVTOOLS');

class DevService {
    // Dedicated devtools bus (no nulls exposed)
    actionSubject = new BehaviorSubject(null);
    readActionSubject = new BehaviorSubject(null);
    action$ = this.actionSubject.asObservable();
    readAction$ = this.readActionSubject.asObservable();
    constructor() { }
    // Explicit emitters to avoid leaking subjects
    emitAction(event) {
        this.actionSubject.next(event);
    }
    emitRead(event) {
        this.readActionSubject.next(event);
    }
    setValue(path, value, oldValue) {
        const action = {
            type: 'SET_VALUE',
            payload: {
                path,
                value,
                oldValue
            }
        };
        this.actionSubject.next(action);
    }
    setArrayOperation(path, method, args, oldValue, newValue) {
        const action = {
            type: 'ARRAY_OPERATION',
            payload: {
                path,
                method,
                args,
                oldValue: oldValue ?? [],
                newValue: newValue ?? []
            }
        };
        this.actionSubject.next(action);
    }
    logUnsubscribe(path) {
        const action = {
            type: 'UNSUBSCRIBE',
            payload: {
                path,
            }
        };
        this.actionSubject.next(action);
    }
    logCleanup(path, cleanedPaths, cleanedCount) {
        const action = {
            type: 'CLEANUP',
            payload: {
                path,
                cleanedPaths,
                cleanedCount
            }
        };
        this.actionSubject.next(action);
    }
    logProxyMetrics(metrics) {
        const action = {
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
    computedStoreUpdate(storeName, operation, key, keys, snapshot) {
        const action = {
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
    behaviorStoreUpdate(storeName, operation, key, keys, value, snapshot) {
        const action = {
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
    arrayOperation(storeName, path, method, args, oldValue, newValue) {
        const action = {
            type: 'ARRAY_OPERATION',
            payload: {
                storeName,
                path,
                method,
                args,
                oldValue: oldValue ?? [],
                newValue: newValue ?? []
            }
        };
        this.actionSubject.next(action);
    }
    // Universal array operation handler
    arrayOperationUniversal(payload) {
        // Rozpoznaj szczegóły operacji
        const { storeName, method, path, oldValue, newValue, addedElements, removedElements, indexes, args } = payload;
        const action = {
            type: 'ARRAY_OPERATION',
            payload: {
                storeName,
                path,
                method,
                args: args ?? [],
                oldValue: oldValue ?? [],
                newValue: newValue ?? [],
                added: addedElements,
                removed: removedElements,
                indexes
            }
        };
        this.actionSubject.next(action);
    }
    // Set value observe
    setValueObserve(storeName, path, value, oldValue) {
        const action = {
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
        if (typeof window === 'undefined')
            return;
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
    updateVisualizer() {
        // No longer needed - handled by Angular component
    }
    // Removed updateVisualizer - now handled by Angular component
    // Version Store updates
    versionStoreUpdate(storeName, operation, path, keys, graph) {
        const action = {
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
    proxyMetrics(storeName, metrics) {
        const action = {
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
    behaviorSubscriptionStats(storeName, stats) {
        const action = {
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
    computedStoreUpdateWithSnapshot(storeName, operation, path, keys, snapshot, graph) {
        const action = {
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
    behaviorStoreUpdateWithState(storeName, operation, path, keys, value, currentState, graph) {
        const action = {
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
    emitActionAsync(event) {
        queueMicrotask(() => this.emitAction(event));
    }
    // ===== STATS METHODS (moved from CreateStoreService) =====
    // These methods are only used by DevTools and should be in DevService
    /**
     * Get behavior subscription statistics for DevTools
     * @param behaviorStore - BehaviorSubject store from CreateStoreService
     * @param subscriptionCounts - Subscription count map from CreateStoreService
     */
    getBehaviorSubscriptionStats(behaviorStore, subscriptionCounts) {
        const details = [];
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
    getBehaviorKeys(behaviorStore) {
        return Object.keys(behaviorStore);
    }
    /**
     * Get all computed store keys for DevTools
     * @param computedStore - Computed signal store from CreateStoreService
     */
    getComputedKeys(computedStore) {
        return Object.keys(computedStore);
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.3.26", ngImport: i0, type: DevService, deps: [], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "20.3.26", ngImport: i0, type: DevService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.3.26", ngImport: i0, type: DevService, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root'
                }]
        }], ctorParameters: () => [] });

function provideSignalStoreDevtools() {
    return { provide: SIGNAL_STORE_DEVTOOLS, useClass: DevService };
}

/**
 * Generated bundle index. Do not edit.
 */

export { DevService, provideSignalStoreDevtools };
//# sourceMappingURL=synestiqx-angular-signal-store-devtools.mjs.map
