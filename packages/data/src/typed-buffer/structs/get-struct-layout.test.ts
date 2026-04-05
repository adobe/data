// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { getStructLayout } from "./get-struct-layout.js";
import type { Schema } from "../../schema/index.js";
import { F32 } from "../../math/f32/index.js";
import { U32 } from "../../math/u32/index.js";
import { I32 } from "../../math/i32/index.js";
import { schema as mat4x4Schema } from "../../math/mat4x4/schema.js";
import { schema as vec3Schema } from "../../math/vec3/schema.js";

describe("getStructLayout", () => {
    it("should handle primitive types", () => {
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
        expect(layout.size).toBe(12); // WGSL: three scalars, struct align 4
        expect(layout.fields.a.offset).toBe(0);
        expect(layout.fields.b.offset).toBe(4);
        expect(layout.fields.c.offset).toBe(8);
    });

    it("should handle vec3 with proper padding", () => {
        const schema: Schema = {
            type: "array",
            items: { type: "number", precision: 1 },
            minItems: 3,
            maxItems: 3
        };

        const layout = getStructLayout(schema)!;
        expect(layout.type).toBe("array");
        expect(layout.size).toBe(12);  // vec3 is 12 bytes, not padded to vec4
        expect(layout.fields["0"].offset).toBe(0);
        expect(layout.fields["1"].offset).toBe(4);
        expect(layout.fields["2"].offset).toBe(8);
    });

    it("should handle nested structs", () => {
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
        // transform (16 bytes) + active (4 bytes) = 20 bytes
        // rounded up to largest member alignment (16 bytes) = 32 bytes
        expect(layout.size).toBe(32);
        
        const transform = layout.fields.transform.type;
        expect(typeof transform).not.toBe("string");
        if (typeof transform !== "string") {
            // position (vec3 = 12 bytes) + scale (4 bytes) = 16 bytes
            // no padding needed, struct alignment is 16 bytes
            expect(transform.size).toBe(16);
            const position = transform.fields.position.type;
            expect(typeof position !== "string" && position.size).toBe(12);
        }
    });

    it("should handle array of structs", () => {
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
        expect(layout.size).toBe(16); // stride roundUp(4,8)=8 per WGSL fixed array
        expect(layout.fields["0"].offset).toBe(0);
        expect(layout.fields["1"].offset).toBe(8);
    });

    it("should place vec4 then vec3 fields per WGSL host-shareable alignment", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                // vec4 (16 bytes, offset 0)
                viewProjection: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 4,
                    maxItems: 4
                },
                // f32 (4 bytes, offset 16)
                lightDirection: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3
                },
                // third vec3 @ offset 32
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

        expect(layout.fields.lightColor.offset).toBe(32);
        expect(layout.size).toBe(48);
    });

    it("should handle vec3<f32> + f32 struct layout correctly", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                // vec3<f32> (12 bytes, padded to 16 bytes, offset 0)
                position: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3
                },
                // f32 (4 bytes, offset 16)
                scale: { type: "number", precision: 1 }
            }
        };

        const layout = getStructLayout(schema)!;
        expect(layout.type).toBe("object");
        
        // vec3<f32> should be 16-byte aligned and take 12 bytes
        expect(layout.fields.position.offset).toBe(0);
        const positionType = layout.fields.position.type;
        if (typeof positionType !== "string") {
            expect(positionType.size).toBe(12);
        }
        
        // f32 should follow immediately at offset 12
        expect(layout.fields.scale.offset).toBe(12);
        
        // Total size should be 12 bytes (vec3) + 4 bytes (f32) = 16 bytes
        // no padding needed, struct alignment is 16 bytes
        expect(layout.size).toBe(16);
    });

    // This sample was pulled from here: https://webgpufundamentals.org/webgpu/lessons/webgpu-memory-layout.html
    it("should handle complex struct with arrays and nested structs (WGSL-aligned)", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                // Main struct fields in expected order
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
                // Ex4a struct
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
        
        // orientation: vec3f at offset 0, size 12 bytes
        expect(layout.fields.orientation.offset).toBe(0);
        const orientationType = layout.fields.orientation.type;
        if (typeof orientationType !== "string") {
            expect(orientationType.size).toBe(12);
        }
        
        // size: f32 at offset 12 (fits right after vec3f)
        expect(layout.fields.size.offset).toBe(12);
        
        // direction: array<vec3f, 1> — stride roundUp(16,12)=16
        expect(layout.fields.direction.offset).toBe(16);
        const directionType = layout.fields.direction.type;
        if (typeof directionType !== "string") {
            expect(directionType.size).toBe(16);
        }
        
        // scale: f32 at offset 32 (after array)
        expect(layout.fields.scale.offset).toBe(32);
        
        expect(layout.fields.info.offset).toBe(48);
        const infoType = layout.fields.info.type;
        if (typeof infoType !== "string") {
            expect(infoType.size).toBe(16);
        }
        
        // friction: f32 at offset 64 (after struct)
        expect(layout.fields.friction.offset).toBe(64);
        
        expect(layout.size).toBe(80);
    });

    // Golden layouts from WGSL host-shareable struct rules (WGSL spec §14.4 memory layout).
    it("WGSL golden: struct { a: f32, b: vec3<f32> } — scalar then vec3", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                a: { type: "number", precision: 1 },
                b: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3,
                },
            },
        };
        const layout = getStructLayout(schema)!;
        expect(layout.fields.a.offset).toBe(0);
        expect(layout.fields.b.offset).toBe(16);
        expect(layout.size).toBe(32);
    });

    it("WGSL golden: struct { u: vec2<f32>, v: vec2<f32> } — two vec2", () => {
        const vec2: Schema = {
            type: "array",
            items: { type: "number", precision: 1 },
            minItems: 2,
            maxItems: 2,
        };
        const schema: Schema = {
            type: "object",
            properties: { u: vec2, v: vec2 },
        };
        const layout = getStructLayout(schema)!;
        expect(layout.fields.u.offset).toBe(0);
        expect(layout.fields.v.offset).toBe(8);
        expect(layout.size).toBe(16);
    });

    it("WGSL golden: vec2<f32> has size 8 (not 16-byte slot)", () => {
        const schema: Schema = {
            type: "array",
            items: { type: "number", precision: 1 },
            minItems: 2,
            maxItems: 2,
        };
        const layout = getStructLayout(schema)!;
        expect(layout.size).toBe(8);
        expect(layout.fields["1"].offset).toBe(4);
    });

    /** Mirrors Cryos `SceneUniforms` (mat4 + vec3 + f32 + vec3 + vec3) for `var<uniform>` buffer sizing. */
    it("WGSL golden: scene-style uniforms struct size and offsets", () => {
        const sceneUniformsLike: Schema = {
            type: "object",
            properties: {
                viewProjectionMatrix: mat4x4Schema,
                lightDirection: vec3Schema,
                ambientStrength: F32.schema,
                lightColor: vec3Schema,
                cameraPosition: vec3Schema,
            },
            required: [
                "viewProjectionMatrix",
                "lightDirection",
                "ambientStrength",
                "lightColor",
                "cameraPosition",
            ],
        };
        const layout = getStructLayout(sceneUniformsLike)!;
        expect(layout.size).toBe(112);
        expect(layout.fields.viewProjectionMatrix.offset).toBe(0);
        expect(layout.fields.lightDirection.offset).toBe(64);
        expect(layout.fields.ambientStrength.offset).toBe(76);
        expect(layout.fields.lightColor.offset).toBe(80);
        expect(layout.fields.cameraPosition.offset).toBe(96);
    });

    it("should reject invalid schemas", () => {
        // Non-fixed length array
        expect(() => getStructLayout({
            type: "array",
            items: { type: "number", precision: 1 }
        })).toThrow();

        // Invalid primitive type
        expect(() => getStructLayout({
            type: "object",
            properties: {
                a: { type: "string" }
            }
        })).toThrow();

        // Array length < 1
        expect(() => getStructLayout({
            type: "array",
            items: { type: "number", precision: 1 },
            minItems: 0,
            maxItems: 0
        })).toThrow();
    });

    describe("packed layout", () => {
        it("should use tight packing for vertex buffers", () => {
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
            
            // position: vec3f at offset 0, size 12 bytes
            expect(packedLayout.fields.position.offset).toBe(0);
            const positionType = packedLayout.fields.position.type;
            if (typeof positionType !== "string") {
                expect(positionType.size).toBe(12);
            }
            
            // color: vec4f at offset 12, size 16 bytes
            expect(packedLayout.fields.color.offset).toBe(12);
            const colorType = packedLayout.fields.color.type;
            if (typeof colorType !== "string") {
                expect(colorType.size).toBe(16);
            }
            
            // Total size should be 28 bytes (no padding for packed layout)
            expect(packedLayout.size).toBe(28);
        });

        it("should show difference between wgsl and packed layouts", () => {
            const wgslSchema: Schema = {
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
                layout: "wgsl"
            };
            const packedSchema: Schema = {
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

            const wgslLayout = getStructLayout(wgslSchema);
            const packedLayout = getStructLayout(packedSchema);

            expect(wgslLayout.size).toBe(32); // vec3 @16 + vec4
            expect(packedLayout.size).toBe(28); // 12 + 16 (no padding)

            expect(wgslLayout.layout).toBe("wgsl");
            expect(packedLayout.layout).toBe("packed");
        });

        it("should work with arrays of primitives in packed mode", () => {
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
            
            // Array should not have excess padding
            const valuesType = packedLayout.fields.values.type;
            expect(typeof valuesType).not.toBe("string");
            if (typeof valuesType !== "string") {
                expect(valuesType.size).toBe(8); // 2 floats * 4 bytes each
            }
            
            expect(packedLayout.size).toBe(8); // No padding
        });
    });

    describe("default layout", () => {
        it("should default to wgsl layout when no layout specified", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            const layout = getStructLayout(schema);
            expect(layout.layout).toBe("wgsl");
            expect(layout.size).toBe(8);
        });

        it("should work with original function signatures", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema
                }
            };

            const layout1 = getStructLayout(schema);
            const layout2 = getStructLayout(schema, true);
            const layout3 = getStructLayout(schema, false);

            expect(layout1?.layout).toBe("wgsl");
            expect(layout2?.layout).toBe("wgsl");
            expect(layout3?.layout).toBe("wgsl");
        });
    });

}); 