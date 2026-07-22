import type { Provider } from '@angular/core';
import { SIGNAL_STORE_DEVTOOLS } from './core/devtools-contract';
import { DevService } from './devtools/dev.service';

export { DevService } from './devtools/dev.service';
export type { AngularStoreDevtools, DevToolsEvent } from './core/devtools-contract';

export function provideSignalStoreDevtools(): Provider {
  return { provide: SIGNAL_STORE_DEVTOOLS, useClass: DevService };
}
