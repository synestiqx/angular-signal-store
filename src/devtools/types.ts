import { Signal, WritableSignal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Base Action
export interface DevToolsAction {
  type: string;
  payload?: Record<string, unknown>;
  storeName?: string;
}

// Specific Action Payloads
export interface SetValuePayload {
  path: string;
  value: unknown;
  oldValue?: unknown;
}

export interface ArrayOperationPayload {
  path: string;
  method: string;
  args: unknown[];
  oldValue: unknown[];
  newValue: unknown[];
}

export interface StoreUpdatePayload {
  storeName: string;
  action: 'add' | 'remove' | 'update';
  path: string;
  keys: string[];
  snapshot?: Record<string, unknown>;
  graph?: unknown; 
}

export interface BehaviorStoreUpdatePayload extends StoreUpdatePayload {
  value?: unknown;
  currentState?: Record<string, BehaviorSubject<unknown>>;
}

export interface VersionStoreUpdatePayload {
  path: string;
  action: 'add' | 'remove' | 'update';
  keys: string[];
  graph?: unknown;
}

export interface ProxyMetricsPayload {
  path: string;
  hits: number;
  misses: number;
  hitRate: number;
  cacheSize: number;
  cacheDump: Array<{ key: string; value: string }>;
  cacheKeys: string[];
  graph?: unknown;
}

// Union Type for all actions
export type StoreDevToolsAction =
  | (DevToolsAction & { type: 'SET_VALUE'; payload: SetValuePayload })
  | (DevToolsAction & { type: 'SET_VALUE_OBSERVE'; payload: SetValuePayload })
  | (DevToolsAction & { type: 'ARRAY_OPERATION'; payload: ArrayOperationPayload })
  | (DevToolsAction & { type: 'COMPUTED_STORE_UPDATE'; payload: StoreUpdatePayload })
  | (DevToolsAction & { type: 'BEHAVIOR_STORE_UPDATE'; payload: BehaviorStoreUpdatePayload })
  | (DevToolsAction & { type: 'VERSION_STORE_UPDATE'; payload: VersionStoreUpdatePayload })
  | (DevToolsAction & { type: 'PROXY_METRICS'; payload: ProxyMetricsPayload })
  | (DevToolsAction & { type: 'UNSUBSCRIBE'; payload: { path: string } })
  | (DevToolsAction & { type: 'CLEANUP'; payload: { path: string; cleanedPaths: string[]; cleanedCount: number } });
