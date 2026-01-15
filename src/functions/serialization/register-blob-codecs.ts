// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Data } from "../../data.js";
import { registerCodec } from "./codec.js";

export function registerBlobCodecs() {
    // Built in support for blobs
    // registerCodec<any>({
    //     name: "Blob",
    //     predicate: (data: any): data is any => data instanceof Blob,
    //     serialize: (data: Blob) => ({ json: data.type,  binary: [data.] }),
    //     deserialize: ({ binary }: { json?: Data, binary: Uint8Array[] }) => new (typedArrayConstructor as any)(binary[0].buffer, binary[0].byteOffset, binary[0].byteLength / typedArrayConstructor.BYTES_PER_ELEMENT),
    // });
}
