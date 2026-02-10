// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { getStructLayout } from "./get-struct-layout.js";
import type { Schema } from "../../schema/index.js";
import { F32 } from "../../math/f32/index.js";
import { U32 } from "../../math/u32/index.js";
import { I32 } from "../../math/i32/index.js";

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
        expect(layout.size).toBe(16);  // rounded to vec4
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
        expect(layout.size).toBe(32);  // 2 structs aligned to vec4
        expect(layout.fields["0"].offset).toBe(0);
        expect(layout.fields["1"].offset).toBe(16);  // aligned to vec4
    });

    it("should demonstrate std140 vec4 + f32 + f32 alignment issue", () => {
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
                // f32 (4 bytes, offset 32) - CORRECT for std140!
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
        
        // The getStructLayout function is actually working correctly for std140!
        // It's properly padding vec3s to 16-byte boundaries
        expect(layout.fields.lightColor.offset).toBe(32); // This is correct!
        
        // The correct std140 layout is:
        // - viewProjection: offset 0, size 16 bytes
        // - lightDirection: offset 16, size 16 bytes (padded to vec4)
        // - lightColor: offset 32, size 16 bytes (padded to vec4)
        // Total size: 48 bytes
        expect(layout.size).toBe(48); // This is correct
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
    it("should handle complex struct with arrays and nested structs (std140 example)", () => {
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
        
        // direction: array<vec3f, 1> at offset 16 (aligned to vec4)
        expect(layout.fields.direction.offset).toBe(16);
        const directionType = layout.fields.direction.type;
        if (typeof directionType !== "string") {
            expect(directionType.size).toBe(16); // vec3f padded to vec4
        }
        
        // scale: f32 at offset 32 (after array)
        expect(layout.fields.scale.offset).toBe(32);
        
        // info: Ex4a struct at offset 48 (aligned to vec4)
        expect(layout.fields.info.offset).toBe(48);
        const infoType = layout.fields.info.type;
        if (typeof infoType !== "string") {
            expect(infoType.size).toBe(16); // vec3f padded to vec4
        }
        
        // friction: f32 at offset 64 (after struct)
        expect(layout.fields.friction.offset).toBe(64);
        
        // Total size should be 68 bytes, rounded up to vec4 = 80 bytes
        expect(layout.size).toBe(80);
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

        it("should show difference between std140 and packed layouts", () => {
            const std140Schema: Schema = {
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
                layout: "std140"
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

            const std140Layout = getStructLayout(std140Schema);
            const packedLayout = getStructLayout(packedSchema);

            // std140 should be larger due to vec4 alignment
            expect(std140Layout.size).toBe(32); // 16 + 16
            expect(packedLayout.size).toBe(28); // 12 + 16 (no padding)
            
            expect(std140Layout.layout).toBe("std140");
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

    describe("backwards compatibility", () => {
        it("should default to std140 layout when no layout specified", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            const layout = getStructLayout(schema); // No layout parameter
            expect(layout.layout).toBe("std140");
            expect(layout.size).toBe(16); // Should be padded to vec4
        });

        it("should work with original function signatures", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema
                }
            };

            // Original signatures should still work
            const layout1 = getStructLayout(schema);
            const layout2 = getStructLayout(schema, true);
            const layout3 = getStructLayout(schema, false);
            
            expect(layout1?.layout).toBe("std140");
            expect(layout2?.layout).toBe("std140");
            expect(layout3?.layout).toBe("std140");
        });
    });

}); 