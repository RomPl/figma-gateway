type CacheRecord = {
  value: unknown;
  expiresAt: number;
};

export type MemoryCacheBackendOptions = {
  now?: () => number;
};

export class MemoryCacheBackend {
  private readonly store = new Map<string, CacheRecord>();
  private readonly now: () => number;

  constructor(options: MemoryCacheBackendOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  public get<T>(key: string): T | undefined {
    const record = this.store.get(key);
    if (!record) {
      return undefined;
    }

    if (record.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }

    return record.value as T;
  }

  public set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: this.now() + ttlMs
    });
  }

  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  public clear(prefix?: string): number {
    if (!prefix) {
      const deleted = this.store.size;
      this.store.clear();
      return deleted;
    }

    let deleted = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        deleted += 1;
      }
    }

    return deleted;
  }
}

export const createMemoryCacheBackend = (options?: MemoryCacheBackendOptions) =>
  new MemoryCacheBackend(options);
