// © 2026 Adobe. MIT License. See /LICENSE for details.

const bitsPerAxis = Math.floor(Math.log2(Number.MAX_SAFE_INTEGER + 1) / 3);
export const axisRange = 2 ** bitsPerAxis;
const axisRangeSq = axisRange * axisRange;
export const axisBias = 2 ** (bitsPerAxis - 1);

export const encodeAxis = (coordinate: number): number => coordinate + axisBias;

export const decodeAxis = (encoded: number): number => encoded - axisBias;

export const packBlockKeyInline = (bx: number, by: number, bz: number): number =>
    encodeAxis(bx) + encodeAxis(by) * axisRange + encodeAxis(bz) * axisRangeSq;

export const packPlaneKeyInline = (outer: number, inner: number): number =>
    encodeAxis(outer) * axisRange + encodeAxis(inner);

export const decodeBlockKeyInline = (
    key: number,
): readonly [bx: number, by: number, bz: number] => {
    const bx = decodeAxis(key % axisRange);
    const by = decodeAxis(((key / axisRange) | 0) % axisRange);
    const bz = decodeAxis(((key / axisRangeSq) | 0) % axisRange);
    return [bx, by, bz] as const;
};

export const createKeyFromWorld = (
    shiftX: number,
    shiftY: number,
    shiftZ: number,
): (x: number, y: number, z: number) => number =>
    (x, y, z) => packBlockKeyInline(x >> shiftX, y >> shiftY, z >> shiftZ);

export const createIndexFromWorld = (
    sx: number,
    sy: number,
    sz: number,
    shiftX: number,
    shiftY: number,
    shiftZ: number,
    strideY: number,
): (x: number, y: number, z: number, blockOffset: number) => number =>
    (x, y, z, blockOffset) => {
        const lx = x - (x >> shiftX) * sx;
        const ly = y - (y >> shiftY) * sy;
        const lz = z - (z >> shiftZ) * sz;
        return blockOffset + lx + strideY * (ly + sy * lz);
    };
