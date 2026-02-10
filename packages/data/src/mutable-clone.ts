// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Mutable } from "./mutable.js";

export const mutableClone = <T extends object>(obj: T): Mutable<T> => {
    return structuredClone(obj) as Mutable<T>;
};