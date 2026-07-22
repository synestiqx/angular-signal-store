import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import type { StoreDevToolsAction } from '../devtools/types';

export type DevToolsEvent = StoreDevToolsAction & { storeName?: string };

export interface AngularStoreDevtools {
  readonly action$: Observable<DevToolsEvent | null>;
  readonly readAction$: Observable<DevToolsEvent | null>;
  emitAction(event: DevToolsEvent): void;
  emitRead(event: DevToolsEvent): void;
  getBehaviorKeys(store: Record<string, unknown>): string[];
  getComputedKeys(store: Record<string, unknown>): string[];
}

export const SIGNAL_STORE_DEVTOOLS = new InjectionToken<AngularStoreDevtools>(
  'SIGNAL_STORE_DEVTOOLS'
);
