// © 2026 Adobe. MIT License. See /LICENSE for details.

import { getCodec, registerCodec } from "../../../functions/serialization/codec.js";
import { DenseVolume } from "./dense-volume.js";
import { isDenseVolume } from "./is-dense-volume.js";

export const registerDenseVolumeCodecs = (): void => {
    registerCodec<DenseVolume<unknown>>({
        name: "dense-volume",
        predicate: isDenseVolume,
        serialize: (volume) => {
            const bufferCodec = getCodec("typed-buffer");
            if (!bufferCodec) {
                throw new Error("typed-buffer codec is not registered");
            }
            const bufferPayload = bufferCodec.serialize(volume.data);
            return {
                json: {
                    size: volume.size,
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
            return new DenseVolume(json.size, data);
        },
    });
};
