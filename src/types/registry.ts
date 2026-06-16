// Global store type registry. Projects can augment this interface
// via declaration merging to provide strong typing for useStore.
// Example (in app code):
// declare module '@/app/store/types/registry' {
//   interface Stores {
//     cart: CartState;
//     user: UserState;
//   }
// }

import type { StoreData } from '../types/advanced-types';

// Base registry provides a safe fallback for unregistered store names.
// Projects can augment this interface with precise mappings.
export interface Stores {
  [key: string]: StoreData;
}
