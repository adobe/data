// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../interface/system/system.js";
import { color, size } from "./helper-commands-keys.test-helper.js";
import { dress, dressLocal, dressReturned } from "./helper-commands.test-helper.js";

/**
 * Kernels issuing commands through the helpers of another module, which name a key, `tag`, this module doesn't import;
 * and the same bodies as written, for `helper-commands.test.ts`.
 */

/** Each helper, from a kernel and from the same body as written. */
export const viaHelper = System.create({ kernel: true, components: { with: [size, color] } }, (row, { commands }) => {
    dress(commands, row.entity, row[color]);
});
export const viaHelperWritten = System.create({ kernel: false, components: { with: [size, color] } }, (row, { commands }) => {
    dress(commands, row.entity, row[color]);
});
export const viaReturned = System.create({ kernel: true, components: { with: [size, color] } }, (row, { commands }) => {
    dressReturned(commands, row.entity, row[color]);
});
export const viaReturnedWritten = System.create({ kernel: false, components: { with: [size, color] } }, (row, { commands }) => {
    dressReturned(commands, row.entity, row[color]);
});
export const viaLocal = System.create({ kernel: true, components: { with: [size, color] } }, (row, { commands }) => {
    dressLocal(commands, row.entity, row[color]);
});
export const viaLocalWritten = System.create({ kernel: false, components: { with: [size, color] } }, (row, { commands }) => {
    dressLocal(commands, row.entity, row[color]);
});
