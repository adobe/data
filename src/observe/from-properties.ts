// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Notify, Observe } from "./index.js";

/**
 * Creates a new Observe function that combines every named observe function into a single observe function with a value this is an object with the same keys.
 * No result is provided until every required observe function has provided a value. If they all provide a value synchronously, then a result will be provided synchronously.
 */
export function fromProperties<
  T extends { [K: string]: Observe<unknown> },
>(
  observeProperties: T
): Observe<{
  readonly [K in keyof T]: T[K] extends Observe<infer U> ? U : never;
}> {
  type ObservableValues = {
    readonly [K in keyof T]: T[K] extends Observe<infer U> ? U : never;
  };
  return (observer: Notify<ObservableValues>) => {
    const values = new Map<keyof T, T[keyof T]>();
    let initializing = true;
    const maybeNotify = () => {
      if (values.size === Object.keys(observeProperties).length) {
        observer(Object.fromEntries(values) as ObservableValues);
      }
    };

    const unobservers = Object.entries(observeProperties)
      .map(([name, observable]) => {
        return observable((value) => {
          values.set(name as keyof T, value as T[keyof T]);
          if (!initializing) {
            maybeNotify();
          }
        });
      })
      .filter(Boolean);

    initializing = false;
    maybeNotify();

    return () => {
      for (const unobserve of unobservers) {
        unobserve();
      }
    };
  };
}
