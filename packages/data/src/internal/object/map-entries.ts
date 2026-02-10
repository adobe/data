// © 2026 Adobe. MIT License. See /LICENSE for details.
export function mapEntries<K extends string | number | symbol, T, R>(record: { readonly [key in K]: T }, fn: (entry: [K, T]) => R): { [key in K]: R } {
    const result = {} as { [key in K]: R };
    for (const [key, value] of Object.entries(record)) {
        (result as any)[key as K] = fn([key, value] as [K, T]);
    }
    return result;
}