/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

/**
 * Basic scalar addition.
 */
export function add(a: i32, b: i32): i32 {
  return a + b;
}

/**
 * Standard scalar array addition using direct pointer arithmetic.
 * Performs: A[i] = A[i] + B[i]
 */
export function addF32Arrays(aPtr: usize, bPtr: usize, length: u32): void {
  const endPtr = aPtr + (<usize>length << 2); // end = start + (length * 4 bytes)

  while (aPtr < endPtr) {
    // Load values
    const va = load<f32>(aPtr);
    const vb = load<f32>(bPtr);

    // Store result
    store<f32>(aPtr, va + vb);

    // Advance pointers by 4 bytes (size of f32)
    aPtr += 4;
    bPtr += 4;
  }
}

/**
 * SIMD optimized array addition.
 * Processes 4 floats (128 bits) per instruction.
 */
export function addF32ArraysSimd4(aPtr: usize, bPtr: usize, length: u32): void {
  // Ensure we have at least 4 elements to process
  if (length >= 4) {
    // Calculate the end boundary for the vector loop
    // We floor the length to the nearest multiple of 4
    const vectorLoopEnd = length & ~3; 
    const endPtr = aPtr + (<usize>vectorLoopEnd << 2);

    while (aPtr < endPtr) {
      // Load 128-bit vectors (4 floats each)
      const va = v128.load(aPtr);
      const vb = v128.load(bPtr);

      // Perform vector addition
      const res = f32x4.add(va, vb);

      // Store result back to A
      v128.store(aPtr, res);

      // Advance pointers by 16 bytes (size of v128)
      aPtr += 16;
      bPtr += 16;
    }

    // Update the remaining length for the scalar fallback
    length -= vectorLoopEnd;
  }

  // Handle remaining elements (0-3 elements)
  // 
  while (length > 0) {
    store<f32>(aPtr, load<f32>(aPtr) + load<f32>(bPtr));
    aPtr += 4;
    bPtr += 4;
    length--;
  }
}

/**
 * Unrolled SIMD array addition.
 * Processes 8 floats per loop iteration (2 vectors) to reduce loop overhead.
 */
export function addF32ArraysSimd4Unrolled(aPtr: usize, bPtr: usize, length: u32): void {
  // We need at least 8 elements to enter the unrolled loop
  if (length >= 8) {
    const unrollMask = ~7; // Multiple of 8
    const vectorLoopLen = length & unrollMask;
    const endPtr = aPtr + (<usize>vectorLoopLen << 2);

    while (aPtr < endPtr) {
      // Load 2 vectors from A and 2 vectors from B
      // Pipelining loads often helps hide memory latency
      const va1 = v128.load(aPtr);
      const vb1 = v128.load(bPtr);
      const va2 = v128.load(aPtr, 16); // Load with offset 16
      const vb2 = v128.load(bPtr, 16);

      // Perform additions
      const res1 = f32x4.add(va1, vb1);
      const res2 = f32x4.add(va2, vb2);

      // Store results
      v128.store(aPtr, res1);
      v128.store(aPtr, res2, 16); // Store with offset 16

      // Advance pointers by 32 bytes (8 floats * 4 bytes)
      aPtr += 32;
      bPtr += 32;
    }
    
    length -= vectorLoopLen;
  }

  // Fallback: Try single SIMD block (4 elements) if enough remain
  if (length >= 4) {
    v128.store(aPtr, f32x4.add(v128.load(aPtr), v128.load(bPtr)));
    aPtr += 16;
    bPtr += 16;
    length -= 4;
  }

  // Fallback: Handle final remaining scalars (0-3 elements)
  while (length > 0) {
    store<f32>(aPtr, load<f32>(aPtr) + load<f32>(bPtr));
    aPtr += 4;
    bPtr += 4;
    length--;
  }
}