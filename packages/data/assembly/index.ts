// © 2026 Adobe. MIT License. See /LICENSE for details.
export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function addF32Arrays(aPtr: usize, bPtr: usize, length: u32): void {
  // now handle any remaining elements
  for (let i: u32 = 0 /*length & ~7*/; i < length; i++) {
    const aOffset = aPtr + (i << 2); // i * 4 (each Float32 is 4 bytes)
    const bOffset = bPtr + (i << 2);

    const va = f32.load(aOffset);
    const vb = f32.load(bOffset);

    f32.store(aOffset, va + vb);
  }
}

export function addF32ArraysSimd4(aPtr: usize, bPtr: usize, length: u32): void {
  const stride = 4; // Process 4 f32 elements per SIMD operation
  let i: u32 = 0;
  const end = length - stride;

  // Handle SIMD operations for chunks of 4 elements
  for (; i < end; i += stride) {
    v128.store(aPtr, f32x4.add(v128.load(aPtr), v128.load(bPtr)));
    aPtr += stride * sizeof<f32>();
    bPtr += stride * sizeof<f32>();
  }

  // Handle remaining elements that aren't divisible by 4
  for (; i < length; i++) {
    store<f32>(aPtr, load<f32>(aPtr) + load<f32>(bPtr));
    aPtr += sizeof<f32>();
    bPtr += sizeof<f32>();
  }
}

export function addF32ArraysSimd4Unrolled(aPtr: usize, bPtr: usize, length: u32): void {
  const stride = 4; // Process 4 f32 elements per SIMD operation
  const unrollFactor = 2; // Number of SIMD operations per loop iteration
  const totalStride = stride * unrollFactor; // Total elements processed per loop iteration
  let i: u32 = 0;
  const end = length - (length % totalStride);

  // Handle SIMD operations for chunks of totalStride elements
  for (; i < end; i += totalStride) {
    // First SIMD operation
    v128.store(aPtr, f32x4.add(v128.load(aPtr), v128.load(bPtr)));
    aPtr += stride * sizeof<f32>();
    bPtr += stride * sizeof<f32>();

    // Second SIMD operation
    v128.store(aPtr, f32x4.add(v128.load(aPtr), v128.load(bPtr)));
    aPtr += stride * sizeof<f32>();
    bPtr += stride * sizeof<f32>();
  }

  // Handle remaining elements that aren't divisible by totalStride
  for (; i < length; i++) {
    store<f32>(aPtr, load<f32>(aPtr) + load<f32>(bPtr));
    aPtr += sizeof<f32>();
    bPtr += sizeof<f32>();
  }
}
