// © 2026 Adobe. MIT License. See /LICENSE for details.

// Polyfills for Node 18 test environment

// window polyfill (minimal — only what the source files actually use)
if (typeof globalThis.window === "undefined") {
  const makeStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (i: number) => [...store.keys()][i] ?? null,
    } as Storage;
  };
  const mockLocation = { origin: "http://localhost", href: "http://localhost/", search: "" };
  (globalThis as any).window = {
    location: mockLocation,
    history: { replaceState: () => {}, pushState: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).sessionStorage = makeStorage();
  (globalThis as any).localStorage = makeStorage();
}

// Cache Storage API polyfill
if (typeof globalThis.caches === "undefined") {
  const stores = new Map<string, Map<string, [Request, Response]>>();

  const makeCache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      async put(request: Request, response: Response): Promise<void> {
        store.set(request.url, [request, response.clone()]);
      },
      async match(request: Request): Promise<Response | undefined> {
        return store.get(request.url)?.[1]?.clone();
      },
      async delete(request: Request): Promise<boolean> {
        return store.delete(request.url);
      },
      async keys(): Promise<readonly Request[]> {
        return [...store.values()].map(([req]) => req);
      },
    };
  };

  (globalThis as any).caches = {
    async open(name: string) {
      return makeCache(name);
    },
  };
}

// Web Crypto API: Node 18 has globalThis.crypto but not the bare `crypto` name in all contexts
if (typeof (globalThis as any).crypto === "undefined") {
  (globalThis as any).crypto = require("node:crypto").webcrypto;
}

// requestAnimationFrame polyfill for Node
if (typeof globalThis.requestAnimationFrame === "undefined") {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

// ES2024 Set methods polyfill for Node 18
if (!Set.prototype.isSupersetOf) {
  Object.assign(Set.prototype, {
    isSupersetOf<T>(this: Set<T>, other: ReadonlySet<T>): boolean {
      for (const item of other) {
        if (!this.has(item)) return false;
      }
      return true;
    },
    isSubsetOf<T>(this: Set<T>, other: ReadonlySet<T>): boolean {
      for (const item of this) {
        if (!other.has(item)) return false;
      }
      return true;
    },
    isDisjointFrom<T>(this: Set<T>, other: ReadonlySet<T>): boolean {
      for (const item of other) {
        if (this.has(item)) return false;
      }
      return true;
    },
  });
}
