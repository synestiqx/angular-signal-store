import { StoreDevToolsAction } from '../../devtools/types';
import type { DevToolsEvent } from '../../core/signal-store.service';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Centralized DevTools emitter.
 * Eliminates duplicated DevTools emission logic across managers.
 * Unix philosophy: single responsibility – emit dev events.
 */
export class DevToolsEmitter {
  private lastMetricsEmit: Record<string, number> = {};
  private metricsThrottleMs = 250;

  constructor(
    private readonly devActive: () => boolean,
    private readonly emitAction: (event: DevToolsEvent) => void,
    private readonly emitRead: (event: DevToolsEvent) => void
  ) {}

  emit(storeName: string, action: StoreDevToolsAction): void {
    if (!this.devActive()) return;
    const event: DevToolsEvent = { ...action, storeName };
    queueMicrotask(() => this.emitAction(event));
    if (action.type !== 'PROXY_METRICS') {
      queueMicrotask(() => this.emitRead(event));
    }
  }

  emitImmediate(storeName: string, action: StoreDevToolsAction): void {
    if (!this.devActive()) return;
    this.emitAction({ ...action, storeName });
  }

  emitMetrics(storeName: string, metrics: { hits: number; misses: number; hitRate: number; cacheSize: number; cacheDump?: Array<{ key: string; value: string }>; cacheKeys?: string[] }): void {
    if (!this.devActive()) return;
    const now = Date.now();
    const last = this.lastMetricsEmit[storeName] || 0;
    if (now - last < this.metricsThrottleMs) return;
    this.lastMetricsEmit[storeName] = now;

    this.emit(storeName, {
      type: 'PROXY_METRICS',
      payload: {
        path: 'proxy-cache',
        ...metrics,
        cacheDump: metrics.cacheDump ?? [],
        cacheKeys: metrics.cacheKeys ?? [],
        graph: undefined,
      },
    });
  }

  setMetricsThrottle(ms: number): void {
    this.metricsThrottleMs = Math.max(0, ms);
  }
}
