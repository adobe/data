import { Archetype, Component, Vec3 } from "../../index.js";

export const position = Symbol("kernelImports/position");
export const spark = Symbol("kernelImports/spark");

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [spark]: { type: true };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(spark, { type: { const: true } });

/** A list a kernel imports: the build reads its components here, and compiles the kernel again when this module changes. */
export const sparks = Archetype.create([position, spark]);
