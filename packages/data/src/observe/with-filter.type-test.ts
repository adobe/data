// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromConstant } from "./from-constant.js";
import { withFilter } from "./with-filter.js";

// Valid uses: U is non-undefined
function _testValidUses() {
    withFilter(fromConstant(1), (v) => v > 0 ? v : null);
    withFilter(fromConstant("a"), (v) => v.length > 0 ? v : undefined);
    withFilter(fromConstant(1), (v) => v > 0 ? v : undefined);
}

// Invalid: undefined is the skip sentinel; U must not include undefined.
// Explicit annotation with U = number | undefined must be rejected.
// @ts-expect-error — U explicitly includes undefined, which is disallowed
withFilter<number, number | undefined>(fromConstant(1), (v) => v > 0 ? v : undefined);
