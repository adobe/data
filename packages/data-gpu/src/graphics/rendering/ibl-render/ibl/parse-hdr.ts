// © 2026 Adobe. MIT License. See /LICENSE for details.

// Minimal Radiance .hdr / RGBE parser. Decodes the run-length encoded form
// (standard for files written by HDRshop / Photosphere / Polyhaven) and
// returns Float32 RGBA in row-major order. A=1 for every pixel.

export interface ParsedHdr {
    width: number;
    height: number;
    rgba: Float32Array;
}

export function parseHdr(buffer: ArrayBuffer): ParsedHdr {
    const bytes = new Uint8Array(buffer);

    // Header: ASCII, terminated by a blank line; then the resolution line.
    const text = new TextDecoder("latin1").decode(bytes);
    const headerEnd = text.indexOf("\n\n");
    if (headerEnd < 0) throw new Error("HDR: missing header terminator");
    const header = text.slice(0, headerEnd);
    if (!header.startsWith("#?RADIANCE") && !header.startsWith("#?RGBE")) {
        throw new Error("HDR: unknown magic");
    }
    if (!/FORMAT=32-bit_rle_rgbe/i.test(header)) {
        throw new Error("HDR: only 32-bit_rle_rgbe is supported");
    }

    // Resolution: e.g. "-Y 512 +X 1024". Negative Y means top-to-bottom.
    const resStart = headerEnd + 2;
    const newline = bytes.indexOf(0x0a, resStart);
    const resLine = new TextDecoder().decode(bytes.subarray(resStart, newline));
    const m = /([+-][YX])\s+(\d+)\s+([+-][YX])\s+(\d+)/.exec(resLine);
    if (!m) throw new Error(`HDR: bad resolution line "${resLine}"`);
    const axisA = m[1], dimA = +m[2], axisB = m[3], dimB = +m[4];
    // We only handle the common -Y +X / +Y +X orientations.
    let width: number, height: number, flipY: boolean;
    if (axisA[1] === "Y") {
        height = dimA; width = dimB;
        flipY = axisA[0] === "+";
    } else {
        width = dimA; height = dimB;
        flipY = axisB[0] === "+";
    }
    if (axisA[1] === axisB[1]) throw new Error("HDR: redundant axes");

    const data = bytes.subarray(newline + 1);
    let p = 0;
    const rgba = new Float32Array(width * height * 4);

    const scanline = new Uint8Array(width * 4);
    for (let y = 0; y < height; y++) {
        if (p + 4 > data.length) throw new Error("HDR: truncated scanline header");
        // RLE-encoded scanline: starts with 0x02 0x02 (hi lo) of width.
        if (
            data[p] === 0x02 && data[p + 1] === 0x02 &&
            ((data[p + 2] << 8) | data[p + 3]) === width &&
            width >= 8 && width <= 0x7fff
        ) {
            p += 4;
            for (let c = 0; c < 4; c++) {
                let x = 0;
                while (x < width) {
                    if (p >= data.length) throw new Error("HDR: truncated RLE channel");
                    const len = data[p++];
                    if (len > 128) {
                        const runLen = len - 128;
                        if (p >= data.length || x + runLen > width) throw new Error("HDR: bad run");
                        const val = data[p++];
                        for (let i = 0; i < runLen; i++) scanline[(x + i) * 4 + c] = val;
                        x += runLen;
                    } else {
                        if (p + len > data.length || x + len > width) throw new Error("HDR: bad literal");
                        for (let i = 0; i < len; i++) scanline[(x + i) * 4 + c] = data[p + i];
                        p += len;
                        x += len;
                    }
                }
            }
        } else {
            // Old-style: raw RGBE pixels in raster order.
            if (p + width * 4 > data.length) throw new Error("HDR: truncated raw scanline");
            scanline.set(data.subarray(p, p + width * 4));
            p += width * 4;
        }

        const dstY = flipY ? height - 1 - y : y;
        const rowOffset = dstY * width * 4;
        for (let x = 0; x < width; x++) {
            const r = scanline[x * 4];
            const g = scanline[x * 4 + 1];
            const b = scanline[x * 4 + 2];
            const e = scanline[x * 4 + 3];
            if (e === 0) {
                rgba[rowOffset + x * 4 + 0] = 0;
                rgba[rowOffset + x * 4 + 1] = 0;
                rgba[rowOffset + x * 4 + 2] = 0;
            } else {
                const scale = Math.pow(2, e - 128) / 256;
                rgba[rowOffset + x * 4 + 0] = r * scale;
                rgba[rowOffset + x * 4 + 1] = g * scale;
                rgba[rowOffset + x * 4 + 2] = b * scale;
            }
            rgba[rowOffset + x * 4 + 3] = 1;
        }
    }

    return { width, height, rgba };
}
