# Guid

A 128-bit RFC 4122 v4 globally-unique identifier, designed for linear-memory
ECS storage and efficient in-process Map lookups.

## Representation

```ts
type Guid = readonly [number, number, number, number]; // 4 × u32
```

128 bits stored as a tuple of four unsigned 32-bit integers. This is the only
representation that slots into the ECS `StructTypedBuffer` column path without
any infrastructure changes — the struct codegen layer (`DataView32`,
`getStructLayout`, `createReadStruct`) is 32-bit-quad-indexed, so `F64`-based
or `bigint`-based schemas are rejected at that layer.

The schema is a fixed-length `U32` array (16 bytes, `std140`-aligned):

```ts
Guid.schema // → { type: 'array', items: U32.schema, minItems: 4, maxItems: 4 }
Guid.layout // → StructLayout { size: 16, type: 'array', fields: { 0,1,2,3 } }
```

## API

```ts
Guid.create()                  // → Guid    RFC 4122 v4 via crypto.getRandomValues
Guid.nil                       // → Guid    [0, 0, 0, 0]
Guid.equals(a, b)              // → boolean
Guid.toUUID(g)                 // → string  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"  ~950 ns
Guid.fromUUID(s)               // → Guid    throws TypeError on bad input
Guid.toUnserializableKey(g)    // → string  8-char WTF-16 Map key, NOT serializable  ~87 ns
```

`toUUID` is for human-readable output and cross-system interop. Use
`toUnserializableKey` on any hot path where the result stays in-process —
it is **~11× faster** to produce and hashes faster as a Map key (~93 ns/set
vs ~215 ns/set at N=100K).

### `Guid.toUnserializableKey`

Returns an 8-character JS string that encodes all 128 bits by splitting each
`u32` into two UTF-16 code units via `String.fromCharCode`. This is the
**minimum-length** JS string for 128 bits and the fastest Map key to produce.

**Use only as a transient in-process Map/Set key.** Some code units may be
lone surrogates (0xD800–0xDFFF), which are valid in WTF-16 JS strings but
corrupt on serialization (JSON, TextEncoder, postMessage). Do not store,
transmit, or serialize the result.

```ts
const key = Guid.toUnserializableKey(g); // fast — ~84–92 ns vs ~950 ns for toUUID
const map = new Map<string, SomeValue>();
map.set(key, value);
map.get(key);
```

---

## Performance

Tests run at N = 1,000,000 (storage) and N = 100,000 (Map keys) in both the
Node and browser vitest projects. Numbers are from Node; browser results were
within 10–20% in most cases. Source: `guid.performance.test.ts`.

### Storage: write (N = 1,000,000)

| Strategy | ns/op | Memory |
|---|---|---|
| **StructTypedBuffer** (4×u32, current) | **~8–10** | **15.3 MB** |
| `BigUint64Array` packed (2×u64, identical footprint) | ~185–250 | 15.3 MB |
| `Array<bigint>` heap (1×128-bit BigInt per slot) | ~270–345 | ~30.5 MB est. |

### Storage: read (N = 1,000,000)

| Strategy | ns/op |
|---|---|
| **StructTypedBuffer** | **~6–7** |
| `BigUint64Array` packed | ~150–205 |
| `Array<bigint>` heap | ~36–37 |

StructTypedBuffer is **20–30× faster** than any BigInt-based storage for both
read and write, despite identical raw byte footprint for the two typed-array
approaches. The cost is the `u32 ↔ BigInt` conversion required on every
access — JavaScript's BigInt arithmetic is expensive relative to direct
typed-array element reads.

The `Array<bigint>` read is faster than `BigUint64Array` read because the
128-bit value is pre-boxed (no re-packing step), but it doubles the memory
footprint and its write is the slowest due to heap allocation and seven BigInt
operations per entry.

### Map key comparison (N = 100,000)

Key encoding is measured separately from the Map operation so the two costs
can be evaluated independently.

#### Set

| Key type | Map set | Encode cost | Est. total memory |
|---|---|---|---|
| 36-char UUID string | ~215–221 ns/op | ~950–1005 ns/op | ~10.7 MB |
| 128-bit BigInt | ~94–100 ns/op | ~270–370 ns/op | ~8.4 MB |
| **8-char min UTF-16 (`toUnserializableKey`)** | **~93–110 ns/op** | **~84–92 ns/op** | **~8.4 MB** |

#### Get

| Key type | Map get |
|---|---|
| 36-char UUID string | ~72–92 ns/op |
| 128-bit BigInt | ~94–97 ns/op |
| **8-char min UTF-16** | **~58–75 ns/op** |

Memory estimates (V8, 64-bit, pointer compression off):
- `SeqOneByteString` (UUID): ~64 bytes/key + ~48 bytes/entry = ~10.7 MB at N=100K
- `BigInt` (128-bit, 2 digits): ~40 bytes/key + ~48 bytes/entry = ~8.4 MB at N=100K
- `SeqTwoByteString` (min-string): ~40 bytes/key + ~48 bytes/entry = ~8.4 MB at N=100K

### Conclusions

**For dense ECS component storage**, use `StructTypedBuffer` via the schema
(`createArchetype({ ..., guid: Guid.schema })`). It is 20–30× faster than
any BigInt representation and has the same 16-byte linear memory footprint.

**For Map/Set lookups keyed on GUIDs**, use `Guid.toUnserializableKey`. It
matches BigInt on set speed, beats it on get, uses the same memory, and is
**~10× faster to encode** than `Guid.toUUID`. The UUID string is the slowest
option across all three dimensions.

**Only use `Guid.toUUID` / `Guid.fromUUID` when human readability or
cross-system interop is required** (logging, APIs, serialization). On a hot
lookup path, the 36-char UUID string costs ~1 µs per key just to produce.
