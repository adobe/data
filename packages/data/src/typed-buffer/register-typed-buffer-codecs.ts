// © 2026 Adobe. MIT License. See /LICENSE for details.

import { copyViewBytes } from "../functions/copy-view-bytes.js";
import { registerCodec } from "../functions/serialization/codec.js";
import { Schema } from "../schema/index.js";
import { createArrayBuffer } from "./create-array-buffer.js";
import { createConstBuffer } from "./create-const-buffer.js";
import { createNumberBuffer } from "./create-number-buffer.js";
import { createStructBuffer } from "./create-struct-buffer.js";
import { isTypedBuffer } from "./is-typed-buffer.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";

export function registerTypedBufferCodecs() {
    registerCodec<TypedBuffer<any>>({
        name: "typed-buffer",
        predicate: isTypedBuffer,
        serialize: (data: TypedBuffer<any>) => {
            const { type, schema, capacity } = data;
            try {
                if (type === "const" || schema.transient) {
                    return { json: { type, schema, capacity } };
                }
                else if (type === "array") {
                    return { json: { type, schema, capacity, array: data.slice() as unknown as any[] } };
                }
                else if (type === "number" || type === "struct") {
                    const typedArray = data.getTypedArray();
                    return { json: { type, schema, capacity }, binary: [new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)] };
                }
                else {
                    throw new Error(`Unknown type: ${type}`);
                }
            }
            catch (e) {
                console.log("error serializing this", data, e, "data.slice", data.slice);
                throw e;
            }
        },
        deserialize: ({ json, binary }: { json?: any, binary: Uint8Array[] }) => {
            const encoded = json as { type: TypedBufferType, schema: Schema, capacity: number, array?: any[] };
            const { type, schema, capacity, array } = encoded;
            if (type === "const") {
                return createConstBuffer(schema, capacity);
            }
            else if (type === "array") {
                const buffer = createArrayBuffer(schema, capacity);
                if (schema.transient) {
                    if (schema.default !== undefined && schema.default !== 0) {
                        for (let i = 0; i < capacity; i++) {
                            buffer.set(i, schema.default);
                        }
                    }
                }
                else {
                    for (let i = 0; i < capacity; i++) {
                        buffer.set(i, array![i]);
                    }
                }
                return buffer;
            }
            else if (type === "number" || type === "struct") {
                const buffer = type === "number" ? createNumberBuffer(schema, capacity) : createStructBuffer(schema, capacity);
                if (schema.transient) {
                    if (schema.default !== undefined && schema.default !== 0) {
                        for (let i = 0; i < capacity; i++) {
                            buffer.set(i, schema.default);
                        }
                    }
                }
                else {
                    copyViewBytes(binary[0], buffer.getTypedArray());
                }
                return buffer;
            }
            else {
                throw new Error(`Unknown type: ${type}`);
            }
        },
    });
}
