import { FlatStoreMap } from '../flat-store-map';

/**
 * Abstract base for reactive node managers (Behavior, Computed, Version).
 * Eliminates duplicated prefix-cleanup, devtools emission, and store-access logic.
 */
export abstract class ReactiveNodeManager<TNode, TStore extends Record<string, unknown> = Record<string, unknown>> {
  protected readonly storeMap = new FlatStoreMap<TNode>();
  protected readonly storeName: string;
  protected readonly readStore: (path: string) => unknown;
  protected readonly devActive: () => boolean;

  constructor(
    storeName: string,
    readStore: (path: string) => unknown,
    devActive: () => boolean
  ) {
    this.storeName = storeName;
    this.readStore = readStore;
    this.devActive = devActive;
  }

  abstract createNode(path: string, initialValue: unknown): TNode;
  abstract onDelete?(path: string, node: TNode): void;

  add(path: string): TNode {
    return this.storeMap.getOrCreate(path, (normalizedPath) => {
      const initialValue = this.readStore(normalizedPath);
      return this.createNode(normalizedPath, initialValue);
    });
  }

  get(path: string): TNode | undefined {
    return this.storeMap.get(path);
  }

  peek(path: string): TNode | undefined {
    return this.storeMap.get(path);
  }

  has(path: string): boolean {
    return this.storeMap.has(path);
  }

  keys(): string[] {
    return this.storeMap.keys();
  }

  store(): Record<string, TNode> {
    return this.storeMap.toObject();
  }

  delete(path: string): void {
    this.storeMap.deleteByPrefix(path, (key, node) => {
      this.onDelete?.(key, node);
    });
  }

  cleanup(pathPrefix?: string): void {
    if (!pathPrefix) {
      this.storeMap.forEach((node, key) => this.onDelete?.(key, node));
      this.storeMap.clear();
      return;
    }
    this.delete(pathPrefix);
  }

  getByPrefix(prefix: string): string[] {
    return this.storeMap.getByPrefix(prefix);
  }

  count(): number {
    return this.storeMap.keys().length;
  }
}
