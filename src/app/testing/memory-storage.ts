/**
 * A localStorage for unit tests.
 *
 * Newer versions of Node define their own global localStorage, which has no working methods
 * unless Node is started with a storage file. It hides the one the test environment provides,
 * so tests that touch storage install this one first.
 */
export class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.has(key) ? this.items.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }

  [name: string]: unknown;
}

/** Replaces the global localStorage with an empty in-memory one. Call it in beforeEach. */
export function useMemoryStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  return storage;
}
