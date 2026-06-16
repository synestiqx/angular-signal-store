export class RingBuffer<T> {
  private values: T[] = [];
  private head = 0;
  private readonly limit: number;

  constructor(capacity: number) {
    this.limit = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0;
  }

  get length(): number {
    return this.values.length;
  }

  get capacity(): number {
    return this.limit;
  }

  push(value: T): void {
    if (this.limit === 0) return;
    if (this.values.length < this.limit) {
      this.values.push(value);
      return;
    }
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.limit;
  }

  clear(): void {
    this.values = [];
    this.head = 0;
  }

  toArray(): T[] {
    if (this.head === 0 || this.values.length < this.limit) {
      return this.values.slice();
    }
    return this.values.slice(this.head).concat(this.values.slice(0, this.head));
  }
}

export class KeyedRingBuffer<T> {
  private readonly buffers = new Map<string, RingBuffer<T>>();

  constructor(private readonly capacity: number) {}

  append(key: string, value: T): T[] {
    const buffer = this.getBuffer(key);
    buffer.push(value);
    return buffer.toArray();
  }

  clear(key: string): void {
    this.buffers.get(key)?.clear();
  }

  snapshot(key: string): T[] {
    return this.buffers.get(key)?.toArray() ?? [];
  }

  private getBuffer(key: string): RingBuffer<T> {
    let buffer = this.buffers.get(key);
    if (!buffer) {
      buffer = new RingBuffer<T>(this.capacity);
      this.buffers.set(key, buffer);
    }
    return buffer;
  }
}
