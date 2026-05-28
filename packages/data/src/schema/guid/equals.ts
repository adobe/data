// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Guid } from "./index.js";

export const equals = (a: Guid, b: Guid): boolean =>
    a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
