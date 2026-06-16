export class ManageFinalizationRegistry<T extends object, K = string> {
  private finalizationRegistry?: FinalizationRegistry<K>;
  private readonly onCleanup: (key: K) => void;
  private readonly registeredKeys: Set<K> = new Set();

  constructor(onCleanup: (key: K) => void) {
    this.onCleanup = onCleanup;
    if (typeof (globalThis as any).FinalizationRegistry !== 'undefined') {
      this.finalizationRegistry = new FinalizationRegistry<K>((key) => {
        this.onCleanup(key);
        this.registeredKeys.delete(key);
      });
    }
  }

  create(value: T, key: K): WeakRef<T> {
    const ref = new WeakRef<T>(value);
    if (this.finalizationRegistry) {
      this.finalizationRegistry.register(value, key);
      this.registeredKeys.add(key);
    }
    return ref;
  }

  unregister(value: T, key: K): void {
    if (this.finalizationRegistry) {
      this.finalizationRegistry.unregister(value);
      this.registeredKeys.delete(key);
    }
  }

  hasRegistered(key: K): boolean {
    return this.registeredKeys.has(key);
  }

  getRegisteredKeys(): K[] {
    return Array.from(this.registeredKeys);
  }

  reset(): void {
    // FinalizationRegistry nie udostępnia metody clear, więc tylko nullujemy referencję
    this.finalizationRegistry = undefined;
    this.registeredKeys.clear();
  }
} 