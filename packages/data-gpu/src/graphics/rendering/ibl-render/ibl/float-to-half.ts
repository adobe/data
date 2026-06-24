// © 2026 Adobe. MIT License. See /LICENSE for details.

// IEEE 754 binary16 (half-float) encoder. WebGPU's rgba16float upload path
// expects Uint16-packed half-floats; Float32 source data has to be converted
// element-wise. Standard bit-twiddle, no infinity/NaN edge cases needed for
// well-formed HDRI input (subnormals are flushed to zero).

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

export function floatToHalf(value: number): number {
    f32[0] = value;
    const bits = u32[0];

    const sign = (bits >> 16) & 0x8000;
    const expRaw = (bits >> 23) & 0xff;
    const mantissa = bits & 0x7fffff;

    if (expRaw === 0xff) {
        // Infinity or NaN.
        return sign | 0x7c00 | (mantissa ? 0x200 : 0);
    }
    const exp = expRaw - 127;
    if (exp >= 16) return sign | 0x7c00;       // overflow → ±Inf
    if (exp < -14) return sign;                  // underflow → ±0
    return sign | ((exp + 15) << 10) | (mantissa >> 13);
}

export function floatArrayToHalf(src: Float32Array): Uint16Array {
    const out = new Uint16Array(src.length);
    for (let i = 0; i < src.length; i++) {
        out[i] = floatToHalf(src[i]);
    }
    return out;
}
