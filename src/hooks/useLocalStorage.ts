import { useCallback, useEffect, useRef, useState } from "react";

/** Same-tab sync: the native `storage` event only fires in *other* tabs. */
const LOCAL_EVENT = "ss-local-storage";

type LocalDetail = { key: string; source: object };

function read<T>(key: string, initialValue: T): T {
  try {
    const item = window.localStorage.getItem(key);
    return item !== null ? (JSON.parse(item) as T) : initialValue;
  } catch {
    // Unparseable JSON or storage blocked (Safari private mode).
    return initialValue;
  }
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => read(key, initialValue));
  // Always holds the latest value so rapid functional updates compose.
  const valueRef = useRef<T>(storedValue);
  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;
  const self = useRef({});

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const next = value instanceof Function ? value(valueRef.current) : value;
        valueRef.current = next;
        setStoredValue(next);
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch (error) {
          console.error(`useLocalStorage[${key}] write error:`, error);
        }
        window.dispatchEvent(new CustomEvent<LocalDetail>(LOCAL_EVENT, { detail: { key, source: self.current } }));
      } catch (error) {
        console.error(`useLocalStorage[${key}] write error:`, error);
      }
    },
    [key],
  );

  useEffect(() => {
    const apply = (next: T) => {
      valueRef.current = next;
      setStoredValue(next);
    };

    // Key changed (or first mount): resync with what is stored under this key.
    apply(read(key, initialRef.current));

    const handleStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      if (e.newValue === null) {
        apply(initialRef.current);
        return;
      }
      try {
        apply(JSON.parse(e.newValue) as T);
      } catch {
        /* ignore malformed value from another tab */
      }
    };
    const handleLocal = (e: Event) => {
      const detail = (e as CustomEvent<LocalDetail>).detail;
      if (!detail || detail.key !== key || detail.source === self.current) return;
      apply(read(key, initialRef.current));
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(LOCAL_EVENT, handleLocal);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LOCAL_EVENT, handleLocal);
    };
  }, [key]);

  return [storedValue, setValue] as const;
}
