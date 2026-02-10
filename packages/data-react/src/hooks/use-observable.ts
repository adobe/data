// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useState, useEffect } from "react";
import type { Observe } from "@adobe/data/observe";

export function useObservable<T>(observable: Observe<T>): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    return observable((newValue) => {
      setValue(newValue);
    });
  }, [observable]);
  return value;
}
