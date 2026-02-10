// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "@adobe/data/observe";
import { useMemo } from "./use-memo.js";
import { useObservable } from "./use-observable.js";

export function useObservableValues<T extends Record<string, Observe<unknown>>>(factory: () => T, deps: unknown[] = []): { [K in keyof T]: T[K] extends Observe<infer U> ? U : never } | undefined {
    const observable = useMemo(() => Observe.fromProperties(factory()), deps);
    return useObservable(observable);
}