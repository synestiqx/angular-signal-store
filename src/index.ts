// Main exports for the store
export { SignalStore } from './core/signal-store.service';
export { CreateStore } from './core/create-store.class';
export type { StoreProxy } from './interfaces/types';
// Type-safe selectors API
export type { Signal } from '@angular/core';

// Re-export for backward compatibility
export { SignalStore as default } from './core/signal-store.service';
