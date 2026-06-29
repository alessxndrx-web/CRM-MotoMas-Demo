export type BrowserStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type LocalStorageAdapter = {
  read<T>(key: string): T | null;
  write<T>(key: string, value: T): void;
  remove(key: string): void;
};

export function createLocalStorageAdapter(
  storage: BrowserStorage,
): LocalStorageAdapter {
  return {
    read<T>(key: string) {
      try {
        const raw = storage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    write<T>(key: string, value: T) {
      storage.setItem(key, JSON.stringify(value));
    },
    remove(key: string) {
      storage.removeItem(key);
    },
  };
}

export function getBrowserLocalStorageAdapter() {
  if (typeof window === "undefined") return null;

  return createLocalStorageAdapter(window.localStorage);
}
