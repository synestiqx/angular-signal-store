import { signal, type WritableSignal } from '@angular/core';
import type { CreateStoreService } from '../create-store.core';
import { BaseManager } from './base.manager';
import { ReactiveNodeManager } from '../../utils/abstracts/reactive-node-manager';
import type { StoreData } from '../../types/advanced-types';

/**
 * VersionManager: stores version signals per path.
 * Refactored with ReactiveNodeManager base.
 */
export class VersionManager<TStore extends StoreData = StoreData> extends BaseManager<TStore> {
  private nodeManager = new (class extends ReactiveNodeManager<WritableSignal<number>> {
    createNode(_path: string): WritableSignal<number> {
      return signal(0);
    }

    onDelete(_path: string, _node: WritableSignal<number>): void {}
  })(
    this.storeName,
    (_path) => undefined, // version signals don't need store value
    () => this.devActive
  );

  constructor(core: CreateStoreService<TStore>, storeName: string) {
    super(core, storeName);
  }

  get(path: string): WritableSignal<number> {
    return this.nodeManager.add(path);
  }

  updateIfExists(path: string): void {
    const node = this.nodeManager.peek(path);
    if (!node) return;
    node.update((n) => n + 1);
    this.emitDevtoolsUpdate('update', this.normalizePath(path));
  }

  cleanup(pathPrefix?: string): void {
    this.nodeManager.cleanup(pathPrefix);
    this.emitDevtoolsUpdate('remove', pathPrefix ? this.normalizePath(pathPrefix) : '');
  }

  keys(): string[] {
    return this.nodeManager.keys();
  }

  hasNodes(): boolean {
    return this.nodeManager.count() > 0;
  }

  private emitDevtoolsUpdate(actionType: 'add' | 'remove' | 'update', path: string): void {
    if (!this.devActive) return;
    this.emitDevTools({
      type: 'VERSION_STORE_UPDATE',
      payload: { storeName: this.storeName, action: actionType, path, keys: this.keys(), graph: undefined }
    });
  }
}
