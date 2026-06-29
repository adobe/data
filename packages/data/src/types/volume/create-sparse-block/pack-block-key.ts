// © 2026 Adobe. MIT License. See /LICENSE for details.

const bitsPerAxis = Math.floor(Math.log2(Number.MAX_SAFE_INTEGER + 1) / 3);
const axisRange = 2 ** bitsPerAxis;
const axisBias = 2 ** (bitsPerAxis - 1);

const encodeAxis = (coordinate: number): number => coordinate + axisBias;

export const packBlockKey = (bx: number, by: number, bz: number): number =>
    encodeAxis(bx) + encodeAxis(by) * axisRange + encodeAxis(bz) * axisRange * axisRange;
