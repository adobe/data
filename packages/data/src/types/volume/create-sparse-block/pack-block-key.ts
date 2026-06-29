// © 2026 Adobe. MIT License. See /LICENSE for details.

const bitsPerAxis = Math.floor(Math.log2(Number.MAX_SAFE_INTEGER + 1) / 3);
const axisRange = 2 ** bitsPerAxis;
const axisBias = 2 ** (bitsPerAxis - 1);

const encodeAxis = (coordinate: number): number => coordinate + axisBias;

/** Pack two block-slice coordinates for group lookup (outer axis in the high lane). */
export const packPlaneKey = (outer: number, inner: number): number =>
    encodeAxis(outer) * axisRange + encodeAxis(inner);

export const packBlockKey = (bx: number, by: number, bz: number): number =>
    encodeAxis(bx) + encodeAxis(by) * axisRange + encodeAxis(bz) * axisRange * axisRange;
