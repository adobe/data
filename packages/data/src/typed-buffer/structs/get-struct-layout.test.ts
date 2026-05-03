// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { getStructLayout } from "./get-struct-layout.js";
import type { Schema } from "../../schema/index.js";
import { F32 } from "../../math/f32/index.js";
import { U32 } from "../../math/u32/index.js";
import { I32 } from "../../math/i32/index.js";

describe("getStructLayout", () => {
    it("packs scalar-only structs without artificial vec4 rounding", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                a: F32.schema,
                b: U32.schema,
                c: I32.schema,
            }
        };

        const layout = getStructLayout(schema);
        expect(layout.type).toBe("object");
        expect(layout.align).toBe(4);
        expect(layout.size).toBe(12);
        expect(layout.fields.a.offset).toBe(0);
        expect(layout.fields.b.offset).toBe(4);
        expect(layout.fields.c.offset).toBe(8);
    });

    it("treats a 3-element primitive array as vec3 (align 16, size 12)", () => {
        const schema: Schema = {
            type: "array",
            items: { type: "number", precision: 1 },
            minItems: 3,
            maxItems: 3
        };

        const layout = getStructLayout(schema)!;
        expect(layout.type).toBe("array");
        expect(layout.align).toBe(16);
        expect(layout.size).toBe(12);
        expect(layout.fields["0"].offset).toBe(0);
        expect(layout.fields["1"].offset).toBe(4);
        expect(layout.fields["2"].offset).toBe(8);
    });

    it("rounds nested structs to their max member alignment", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                transform: {
                    type: "object",
                    properties: {
                        position: {
                            type: "array",
                            items: F32.schema,
                            minItems: 3,
                            maxItems: 3
                        },
                        scale: F32.schema
                    }
                },
                active: U32.schema
            }
        };

        const layout = getStructLayout(schema)!;
        expect(layout.type).toBe("object");
        expect(layout.align).toBe(16);
        expect(layout.size).toBe(32);

        const transform = layout.fields.transform.type;
        expect(typeof transform).not.toBe("string");
        if (typeof transform !== "string") {
            expect(transform.align).toBe(16);
            expect(transform.size).toBe(16);
            const position = transform.fields.position.type;
            expect(typeof position !== "string" && position.size).toBe(12);
        }
    });

    it("computes array<struct> stride from element align and size", () => {
        const schema: Schema = {
            type: "array",
            items: {
                type: "object",
                properties: {
                    x: { type: "number", precision: 1 },
                    y: { type: "number", precision: 1 }
                }
            },
            minItems: 2,
            maxItems: 2
        };

        const layout = getStructLayout(schema)!;
        expect(layout.type).toBe("array");
        // element struct: align 4, size 8 -> stride 8 (no vec4 rounding for scalar-only structs)
        expect(layout.size).toBe(16);
        expect(layout.fields["0"].offset).toBe(0);
        expect(layout.fields["1"].offset).toBe(8);
    });

    it("aligns vec3/f32 mix per WGSL: vec4 + vec3 + vec3 packs to 48 bytes", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                viewProjection: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 4,
                    maxItems: 4
                },
                lightDirection: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3
                },
                lightColor: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3
                }
            }
        };

        const layout = getStructLayout(schema)!;
        expect(layout.type).toBe("object");

        // viewProjection vec4 at 0..16, lightDirection vec3 at 16..28, lightColor vec3
        // align 16 -> at 32, ends 44; struct align 16 -> size = roundUp(44, 16) = 48.
        expect(layout.fields.viewProjection.offset).toBe(0);
        expect(layout.fields.lightDirection.offset).toBe(16);
        expect(layout.fields.lightColor.offset).toBe(32);
        expect(layout.size).toBe(48);
    });

    it("packs vec3 followed by f32 tightly (the 12+4 = 16 case)", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                position: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3
                },
                scale: { type: "number", precision: 1 }
            }
        };

        const layout = getStructLayout(schema)!;
        expect(layout.type).toBe("object");

        expect(layout.fields.position.offset).toBe(0);
        const positionType = layout.fields.position.type;
        if (typeof positionType !== "string") {
            expect(positionType.size).toBe(12);
        }

        expect(layout.fields.scale.offset).toBe(12);
        expect(layout.size).toBe(16);
    });

    // Sample loosely based on https://webgpufundamentals.org/webgpu/lessons/webgpu-memory-layout.html
    it("handles complex struct with arrays and nested structs", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                orientation: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3
                },
                size: { type: "number", precision: 1 },
                direction: {
                    type: "array",
                    items: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        minItems: 3,
                        maxItems: 3
                    },
                    minItems: 1,
                    maxItems: 1
                },
                scale: { type: "number", precision: 1 },
                info: {
                    type: "object",
                    properties: {
                        velocity: {
                            type: "array",
                            items: { type: "number", precision: 1 },
                            minItems: 3,
                            maxItems: 3
                        }
                    }
                },
                friction: { type: "number", precision: 1 }
            }
        };

        const layout = getStructLayout(schema)!;
        expect(layout.type).toBe("object");

        expect(layout.fields.orientation.offset).toBe(0);
        const orientationType = layout.fields.orientation.type;
        if (typeof orientationType !== "string") {
            expect(orientationType.size).toBe(12);
        }

        expect(layout.fields.size.offset).toBe(12);

        // array<vec3, 1>: element stride = roundUp(16, 12) = 16, total size 16, align 16
        expect(layout.fields.direction.offset).toBe(16);
        const directionType = layout.fields.direction.type;
        if (typeof directionType !== "string") {
            expect(directionType.size).toBe(16);
        }

        expect(layout.fields.scale.offset).toBe(32);

        // info struct holds a vec3 -> struct align 16, size 16
        expect(layout.fields.info.offset).toBe(48);
        const infoType = layout.fields.info.type;
        if (typeof infoType !== "string") {
            expect(infoType.size).toBe(16);
        }

        expect(layout.fields.friction.offset).toBe(64);

        // outer struct align = 16, size = roundUp(68, 16) = 80
        expect(layout.size).toBe(80);
    });

    it("rejects invalid schemas", () => {
        expect(() => getStructLayout({
            type: "array",
            items: { type: "number", precision: 1 }
        })).toThrow();

        expect(() => getStructLayout({
            type: "object",
            properties: {
                a: { type: "string" }
            }
        })).toThrow();

        expect(() => getStructLayout({
            type: "array",
            items: { type: "number", precision: 1 },
            minItems: 0,
            maxItems: 0
        })).toThrow();
    });

    describe("storage layout (WGSL host-shareable)", () => {
        it("aligns vec2 to 8 bytes inside a struct", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        minItems: 2,
                        maxItems: 2
                    }
                },
                layout: "storage"
            };

            const layout = getStructLayout(schema);
            expect(layout.fields.a.offset).toBe(0);
            // vec2 must align to 8 -> next slot after f32 (offset 4) rounds up to 8.
            expect(layout.fields.b.offset).toBe(8);
            expect(layout.align).toBe(8);
            expect(layout.size).toBe(16);
        });

        it("rounds struct size up to max member alignment (Material-style: vec4 + … + f32 = 112)", () => {
            const Vec2: Schema = {
                type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2,
            };
            const Vec3: Schema = {
                type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3,
            };
            const Vec4: Schema = {
                type: "array", items: { type: "number", precision: 1 }, minItems: 4, maxItems: 4,
            };

            const schema: Schema = {
                type: "object",
                properties: {
                    baseColor: Vec4,
                    metallic: F32.schema,
                    roughness: F32.schema,
                    irReflectance: F32.schema,
                    irEmission: F32.schema,
                    emissionRgb: Vec3,
                    emissionMode: F32.schema,
                    density: F32.schema,
                    viscosity: F32.schema,
                    specificHeatCapacity: F32.schema,
                    thermalConductivity: F32.schema,
                    tensileYieldStrainStress: Vec2,
                    tensileFractureStrainStress: Vec2,
                    compressiveYieldStrainStress: Vec2,
                    compressiveFractureStrainStress: Vec2,
                    restitution: F32.schema,
                },
                layout: "storage",
            };

            const layout = getStructLayout(schema);
            expect(layout.fields.baseColor.offset).toBe(0);
            expect(layout.fields.emissionRgb.offset).toBe(32);
            expect(layout.fields.tensileYieldStrainStress.offset).toBe(64);
            expect(layout.fields.restitution.offset).toBe(96);
            expect(layout.align).toBe(16);
            expect(layout.size).toBe(112);
        });

        it("uses element-tight strides for arrays of primitives and vec3 stride 16", () => {
            const arrayOfF32: Schema = {
                type: "object",
                properties: {
                    values: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        // vec1 isn't supported, so test via 5 elements outside the vec range
                        minItems: 5,
                        maxItems: 5,
                    },
                },
                layout: "storage",
            };
            const layout1 = getStructLayout(arrayOfF32);
            // element f32 align 4 size 4 -> stride 4 -> total 20
            const valuesType1 = layout1.fields.values.type;
            if (typeof valuesType1 !== "string") {
                expect(valuesType1.size).toBe(20);
            }

            const arrayOfVec3: Schema = {
                type: "object",
                properties: {
                    directions: {
                        type: "array",
                        items: {
                            type: "array",
                            items: { type: "number", precision: 1 },
                            minItems: 3,
                            maxItems: 3,
                        },
                        minItems: 4,
                        maxItems: 4,
                    },
                },
                layout: "storage",
            };
            const layout2 = getStructLayout(arrayOfVec3);
            // element vec3 align 16 size 12 -> stride 16 -> total 64
            const valuesType2 = layout2.fields.directions.type;
            if (typeof valuesType2 !== "string") {
                expect(valuesType2.size).toBe(64);
                expect(valuesType2.align).toBe(16);
            }
        });
    });

    describe("packed layout (vertex buffer streams)", () => {
        it("uses tight packing", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        minItems: 3,
                        maxItems: 3
                    },
                    color: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        minItems: 4,
                        maxItems: 4
                    }
                },
                layout: "packed"
            };

            const packedLayout = getStructLayout(schema);
            expect(packedLayout.layout).toBe("packed");
            expect(packedLayout.type).toBe("object");
            expect(packedLayout.align).toBe(1);

            expect(packedLayout.fields.position.offset).toBe(0);
            const positionType = packedLayout.fields.position.type;
            if (typeof positionType !== "string") {
                expect(positionType.size).toBe(12);
            }

            expect(packedLayout.fields.color.offset).toBe(12);
            const colorType = packedLayout.fields.color.type;
            if (typeof colorType !== "string") {
                expect(colorType.size).toBe(16);
            }

            expect(packedLayout.size).toBe(28);
        });

        it("differs from storage layout: tighter struct size", () => {
            const schemaProps = {
                position: {
                    type: "array" as const,
                    items: { type: "number" as const, precision: 1 as const },
                    minItems: 3,
                    maxItems: 3
                },
                color: {
                    type: "array" as const,
                    items: { type: "number" as const, precision: 1 as const },
                    minItems: 4,
                    maxItems: 4
                }
            };

            const storageSchema: Schema = { type: "object", properties: schemaProps, layout: "storage" };
            const packedSchema: Schema = { type: "object", properties: schemaProps, layout: "packed" };

            const storageLayout = getStructLayout(storageSchema);
            const packedLayout = getStructLayout(packedSchema);

            // storage: vec3 at 0..12, vec4 at 16..32, struct align 16 -> size 32
            expect(storageLayout.size).toBe(32);
            // packed: vec3 at 0..12, vec4 at 12..28, no rounding -> size 28
            expect(packedLayout.size).toBe(28);

            expect(storageLayout.layout).toBe("storage");
            expect(packedLayout.layout).toBe("packed");
        });

        it("works with arrays of primitives in packed mode", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    values: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        minItems: 2,
                        maxItems: 2
                    }
                },
                layout: "packed"
            };

            const packedLayout = getStructLayout(schema);
            expect(packedLayout.layout).toBe("packed");
            expect(packedLayout.type).toBe("object");

            const valuesType = packedLayout.fields.values.type;
            expect(typeof valuesType).not.toBe("string");
            if (typeof valuesType !== "string") {
                expect(valuesType.size).toBe(8);
            }

            expect(packedLayout.size).toBe(8);
        });
    });

    describe("default layout", () => {
        it("defaults to \"storage\" when no layout specified", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            const layout = getStructLayout(schema);
            expect(layout.layout).toBe("storage");
            // scalar-only struct: align 4, size 8 (no vec4 rounding)
            expect(layout.align).toBe(4);
            expect(layout.size).toBe(8);
        });

        it("works with original function signatures", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema
                }
            };

            const layout1 = getStructLayout(schema);
            const layout2 = getStructLayout(schema, true);
            const layout3 = getStructLayout(schema, false);

            expect(layout1?.layout).toBe("storage");
            expect(layout2?.layout).toBe("storage");
            expect(layout3?.layout).toBe("storage");
        });
    });

});
