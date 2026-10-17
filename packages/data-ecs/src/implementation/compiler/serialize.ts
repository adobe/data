import { printNumber } from './print.js';

/** Data as a JS literal; unlike JSON, it keeps NaN, infinities and -0. */
export const serialize = (value: unknown): string => {
    if (typeof value === "number") return printNumber(value);
    if (typeof value === "string" || typeof value === "boolean" || value === null) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(serialize).join(", ")}]`;
    if (typeof value === "object") return `{ ${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${serialize(item)}`).join(", ")} }`;
    return "undefined";
};
