// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../../math/index.js";
import { getCodec, registerCodec } from "../../../functions/serialization/codec.js";
import { normalizeBlockSize } from "./block-dims.js";
import { SparseBlockVolume } from "./sparse-block-volume.js";
import { isSparseBlockVolume } from "./is-sparse-block-volume.js";

export const registerSparseBlockVolumeCodecs = (): void => {
    registerCodec<SparseBlockVolume<unknown>>({
        name: "sparse-block-volume",
        predicate: isSparseBlockVolume,
        serialize: (volume) => {
            const bufferCodec = getCodec("typed-buffer");
            if (!bufferCodec) {
                throw new Error("typed-buffer codec is not registered");
            }
            const { blockSize, size, blocks, data } = volume.toSerialized();
            const bufferPayload = bufferCodec.serialize(data);
            return {
                json: {
                    blockSize,
                    size,
                    blocks,
                    data: bufferPayload.json,
                },
                binary: bufferPayload.binary,
            };
        },
        deserialize: ({ json, binary }) => {
            const bufferCodec = getCodec("typed-buffer");
            if (!bufferCodec) {
                throw new Error("typed-buffer codec is not registered");
            }
            const data = bufferCodec.deserialize({ json: json.data, binary });
            return SparseBlockVolume.fromSerialized(
                normalizeBlockSize(json.blockSize as number | Vec3),
                data,
                json.size,
                json.blocks,
            );
        },
    });
};
