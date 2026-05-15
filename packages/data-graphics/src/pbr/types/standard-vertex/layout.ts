// © 2026 Adobe. MIT License. See /LICENSE for details.

import { getStructLayout } from "@adobe/data/typed-buffer";
import { schema } from "./schema.js";

const sl = getStructLayout(schema);

export const layout: GPUVertexBufferLayout = {
    arrayStride: sl.size,
    stepMode: "vertex",
    attributes: [
        { format: "float32x3", offset: sl.fields["position"]!.offset, shaderLocation: 0 },
        { format: "float32x3", offset: sl.fields["normal"]!.offset, shaderLocation: 1 },
        { format: "float32x4", offset: sl.fields["tangent"]!.offset, shaderLocation: 2 },
        { format: "float32x2", offset: sl.fields["uv"]!.offset, shaderLocation: 3 },
    ],
};

export const stride = sl.size;
