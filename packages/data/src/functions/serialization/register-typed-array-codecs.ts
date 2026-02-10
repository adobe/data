// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Data } from "../../data.js";
import { registerCodec } from "./codec.js";

export function registerTypedArrayCodecs() {
    // Support for all typed arrays
    const typedArrayConstructors = [
        Int8Array,
        Uint8Array,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array
    ];

    for (const typedArrayConstructor of typedArrayConstructors) {
        registerCodec<any>({
            name: typedArrayConstructor.name,
            predicate: (data: any): data is any => data instanceof typedArrayConstructor,
            serialize: (data: any) => ({ binary: [new Uint8Array(data.buffer, data.byteOffset, data.byteLength)] }),
            deserialize: ({ binary }: { json?: Data, binary: Uint8Array[] }) => new (typedArrayConstructor as any)(binary[0].buffer, binary[0].byteOffset, binary[0].byteLength / typedArrayConstructor.BYTES_PER_ELEMENT),
        });
    }
}
