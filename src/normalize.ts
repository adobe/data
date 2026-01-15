// © 2026 Adobe. MIT License. See /LICENSE for details.

export function normalize<D>(d: D): D {
  //  we could structured clone but let's explicitly shed any keys with undefined values.
  return JSON.parse(JSON.stringify(d), (_key: string, value: unknown) => {
    if (value && !Array.isArray(value) && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) =>
          //  not using String.localeCompare
          //  we want this consistent no matter locale
          a < b ? -1 : a > b ? 1 : 0
        )
      );
    }
    return value;
  });
}
