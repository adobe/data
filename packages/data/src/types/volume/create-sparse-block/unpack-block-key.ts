// © 2026 Adobe. MIT License. See /LICENSE for details.

const bitsPerAxis = Math.floor(Math.log2(Number.MAX_SAFE_INTEGER + 1) / 3);
const axisRange = 2 ** bitsPerAxis;
const axisBias = 2 ** (bitsPerAxis - 1);

const decodeAxis = (encoded: number): number => encoded - axisBias;

export const unpackBlockKey = (key: number): { readonly bx: number; readonly by: number; readonly bz: number } => {
    const bx = decodeAxis(key % axisRange);
    const by = decodeAxis(Math.floor(key / axisRange) % axisRange);
    const bz = decodeAxis(Math.floor(key / (axisRange * axisRange)) % axisRange);
    return { bx, by, bz };
};
