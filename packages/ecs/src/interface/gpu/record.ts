/**
 * Bytes per parameter or table record, the dynamic offset alignment WebGPU guarantees. A record is `u32` words: a
 * row count, then a word address in the heap per column, then, for kernels, scalars as f32 bits.
 */
export const recordBytes = 256;
