import { Vec3 } from "../../math/vec3/index.js";
import { TypedBuffer } from "../../typed-buffer/index.js";

export type DenseVolume<T> = {
    readonly type: "dense";
    readonly size: Vec3;
    readonly data: TypedBuffer<T>;
};

export * as DenseVolume from "./public.js";
