import { Schema } from "@adobe/data/schema";
import { Vec3 } from "@adobe/data/math";

export const beta = Schema.fromStructProperties({
    position: Vec3.F32.schema,
    velocity: Vec3.F32.schema,
    gridIndex: Vec3.U32.schema,
});
