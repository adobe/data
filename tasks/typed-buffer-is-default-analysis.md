# TypedBuffer Default Value Checking Analysis

## Current State

TypedBuffer has 4 types with different backing storage:
1. **NumberTypedBuffer** (`type: "number"`) - Backed by TypedArray (Uint32Array, Int32Array, Float32Array, Float64Array)
2. **StructTypedBuffer** (`type: "struct"`) - Backed by TypedArray via DataView32 (stored as Float32Array quads)
3. **ArrayTypedBuffer** (`type: "array"`) - Backed by regular JavaScript Array
4. **ConstTypedBuffer** (`type: "const"`) - Constant value from `schema.const`

## Current API Limitations

- `get(index)` - Returns value at index (may allocate objects for structs)
- `getTypedArray()` - Returns underlying TypedArray (throws for array/const types)
- No efficient way to check if a value equals the default without:
  - Calling `get()` which may allocate objects (structs)
  - Comparing with `schema.default` (requires schema.default to exist)

## Proposed Solution: Add `isDefault(index: number): boolean` Method

### Implementation Strategy

**For TypedArray-backed buffers** (`type: "number"` or `type: "struct"`):
- Directly check if underlying TypedArray values are 0
- Very fast: O(1) for numbers, O(struct_size/4) for structs
- No allocations, direct memory access
- Works because TypedArrays initialize to 0, and default is always 0 for these types

**For Array-backed buffers** (`type: "array"`):
- Require `schema.default` to be defined (throw error if undefined)
- Compare `get(index) === schema.default` using `Object.is()` for strict equality
- Still requires get() call but validates schema.default upfront

**For Const buffers** (`type: "const"`):
- Check if `schema.const === schema.default` (if default exists)
- Or if const value represents the "empty" value for the type

### Performance Benefits

- **NumberTypedBuffer**: Direct memory access `this.array[index] === 0` - fastest possible
- **StructTypedBuffer**: Check all Float32 values in struct region are 0 - fast, no object allocation
- **ArrayTypedBuffer**: Requires get() call but validates schema.default exists upfront
- **ConstTypedBuffer**: Trivial check, no per-index overhead

### API Design

```typescript
// Add to ReadonlyTypedBuffer interface and TypedBuffer abstract class
isDefault(index: number): boolean;
```

### Implementation Details

**NumberTypedBuffer.isDefault(index)**:
```typescript
isDefault(index: number): boolean {
    return this.array[index] === 0;
}
```

**StructTypedBuffer.isDefault(index)**:
```typescript
isDefault(index: number): boolean {
    const startQuad = index * this.sizeInQuads;
    const endQuad = startQuad + this.sizeInQuads;
    // Check all Float32 values in struct are 0
    for (let i = startQuad; i < endQuad; i++) {
        if (this.typedArray[i] !== 0) return false;
    }
    return true;
}
```

**ArrayTypedBuffer.isDefault(index)**:
```typescript
isDefault(index: number): boolean {
    if (this.schema.default === undefined) {
        throw new Error("ArrayTypedBuffer requires schema.default to check for default values");
    }
    return Object.is(this.array[index], this.schema.default);
}
```

**ConstTypedBuffer.isDefault(index)**:
```typescript
isDefault(index: number): boolean {
    if (this.schema.default === undefined) {
        // If no default, const buffer is never "default" (it's always the const value)
        return false;
    }
    return Object.is(this.constValue, this.schema.default);
}
```

### Validation Requirements

- For ArrayTypedBuffer: Require `schema.default !== undefined` or throw descriptive error
- For StructTypedBuffer: Check all bytes/Float32 values in struct layout are 0
- For NumberTypedBuffer: Simple `=== 0` check (handles all numeric types correctly)
- For ConstTypedBuffer: Compare const value with default using Object.is()

### Edge Cases Handled

- Struct with non-zero default: Not applicable - TypedArray-backed buffers always default to 0
- Array with undefined/null values: Use Object.is() for proper null/undefined handling
- TypedArray with NaN: `NaN === 0` is false, but `getTypedArray()[index] === 0` handles this correctly
- Float32Array with -0.0: `-0 === 0` is true in JavaScript, which is correct behavior
- Empty/undefined array elements: Object.is() handles undefined correctly

### Usage in ColumnVolume Conversion

This method enables efficient column scanning:
```typescript
// Instead of:
const voxel = volume.data.get(index);
const isEmpty = voxel === emptyValue; // May allocate for structs

// Use:
const isEmpty = volume.data.isDefault(index); // Fast, no allocation
```

### Benefits for ColumnVolume.create()

- **Performance**: Direct memory access for TypedArray-backed buffers (most common case)
- **No allocations**: Avoids creating objects when scanning for empty voxels
- **Type safety**: Validates schema.default exists for Array buffers upfront
- **Correctness**: Handles all edge cases (NaN, -0, undefined, null) properly
