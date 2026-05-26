// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Guid } from "./index.js";

const PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const fromUUID = (s: string): Guid => {
    if (!PATTERN.test(s)) {
        throw new TypeError(`Invalid GUID string: "${s}"`);
    }
    const h = s.replace(/-/g, "");
    return [
        parseInt(h.slice(0, 8), 16),
        parseInt(h.slice(8, 16), 16),
        parseInt(h.slice(16, 24), 16),
        parseInt(h.slice(24, 32), 16),
    ];
};
