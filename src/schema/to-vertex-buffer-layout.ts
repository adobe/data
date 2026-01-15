// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Layout, Schema } from "./schema.js";
import { StructLayout, StructLayoutField } from "../typed-buffer/structs/struct-layout.js";
import { getStructLayout } from "../typed-buffer/structs/get-struct-layout.js";

// WebGPU types (avoiding import to prevent dependency issues)
export interface GPUVertexBufferLayout {
    arrayStride: number;
    stepMode?: 'vertex' | 'instance';
    attributes: GPUVertexAttributeDescriptor[];
}

export interface GPUVertexAttributeDescriptor {
    format: GPUVertexFormat;
    offset: number;
    shaderLocation: number;
}

export type GPUVertexFormat = 
    | 'uint8x2'
    | 'uint8x8'
    | 'sint8x2'
    | 'sint8x8'
    | 'unorm8x2'
    | 'unorm8x8'
    | 'snorm8x2'
    | 'snorm8x8'
    | 'uint16x2'
    | 'uint16x4'
    | 'sint16x2'
    | 'sint16x4'
    | 'unorm16x2'
    | 'unorm16x4'
    | 'snorm16x2'
    | 'snorm16x4'
    | 'float16x2'
    | 'float16x4'
    | 'float32'
    | 'float32x2'
    | 'float32x3'
    | 'float32x4'
    | 'uint32'
    | 'uint32x2'
    | 'uint32x3'
    | 'uint32x4'
    | 'sint32'
    | 'sint32x2'
    | 'sint32x3'
    | 'sint32x4';

/**
 * Converts a struct field layout to equivalent WebGPU vertex format
 */
function fieldLayoutToVertexFormat(fieldLayout: StructLayoutField | string): GPUVertexFormat {
    if (typeof fieldLayout === "string") {
        // Handle primitive types
        switch (fieldLayout) {
            case "f32": return "float32";
            case "i32": return "sint32";
            case "u32": return "uint32";
        }
    }
    
    if (typeof fieldLayout === "object") {
        const fieldType = fieldLayout.type;
        if (typeof fieldType === "string") {
            // Primitive type
            switch (fieldType) {
                case "f32": return "float32";
                case "i32": return "sint32";
                case "u32": return "uint32";
            }
        } else if (typeof fieldType === "object" && fieldType.type === "array") {
            // Handle array/vector types
            const elementCount = getVectorElementCount(fieldType);
            
            switch (elementCount) {
                case 1: return "float32";        // f32
                case 2: return "float32x2";       // vec2
                case 3: return "float32x3";       // vec3  
                case 4: return "float32x4";       // vec4
            }
        }
    }
    
    throw new Error(`Unsupported field layout for vertex buffer: ${JSON.stringify(fieldLayout)}`);
}

/**
 * Determines the number of elements in a vector from field layout
 */
function getVectorElementCount(fieldLayout: StructLayout): number {
    // For fixed-size arrays like Vec3/Vec4, count the fields
    const fieldCount = Object.keys(fieldLayout.fields).length;
    if (fieldCount >= 1 && fieldCount <= 4) {
        return fieldCount;
    }
    
    throw new Error(`Vector dimensions must be 1-4 elements, got ${fieldCount}`);
}

/**
 * Options for configuring vertex buffer layout generation
 */
export interface VertexBufferLayoutOptions {
    /** Layout mode to use (defaults to schema.layout or "packed") */
    layout?: Layout;
    /** Custom shader location mapping for fields */
    shaderLocations?: Partial<Record<string, number>>;
    /** Step mode for vertex buffer (default: 'vertex') */
    stepMode?: 'vertex' | 'instance';
}

/**
 * Converts a Schema to a WebGPU GPUVertexBufferLayout descriptor
 * 
 * @param schema - Schema defining the vertex structure
 * @param options - Configuration options for layout generation
 * @returns GPUVertexBufferLayout descriptor ready for WebGPU pipeline creation
 * 
 * @example
 * ```typescript
 * const vertexLayout = schemaToVertexBufferLayout(positionColorNormalVertexSchema, {
 *     shaderLocations: { position: 0, color: 8, normal: 9 }
 * });
 * 
 * const pipeline = device.createRenderPipeline({
 *     vertex: {
 *         module: shaderModule,
 *         entryPoint: 'vs_main',
 *         buffers: [{ ...vertexLayout }]
 *     },
 *     // ...
 * });
 * ```
 */
export function toVertexBufferLayout<S extends Schema>(
    schema: S,
    options: VertexBufferLayoutOptions = {}
): GPUVertexBufferLayout {
    // Determine layout to use
    const layoutMode = options.layout ?? schema.layout ?? "packed";
    
    // Get struct layout information
    const structLayout = getStructLayout({ ...schema, layout: layoutMode }, true);
    
    if (!structLayout) {
        throw new Error("Schema is not a valid vertex buffer layout - must be a struct schema");
    }
    
    const attributes: GPUVertexAttributeDescriptor[] = [];
    let nextShaderLocation = 0;
    
    // Generate attributes for each field
    for (const [fieldName, fieldLayout] of Object.entries(structLayout.fields)) {
        const shaderLocation = options.shaderLocations?.[fieldName] ?? nextShaderLocation;
        
        try {
            const fieldLayoutTyped = fieldLayout as StructLayoutField;
            const fieldType = fieldLayoutTyped.type;
            const format = typeof fieldType === "string" 
                ? fieldLayoutToVertexFormat(fieldType)
                : fieldLayoutToVertexFormat(fieldLayoutTyped);
            attributes.push({
                format,
                offset: fieldLayoutTyped.offset,
                shaderLocation
            });
        } catch (error) {
            throw new Error(`Field "${fieldName}" cannot be converted to vertex format: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        if (!options.shaderLocations?.[fieldName]) {
            nextShaderLocation++;
        }
    }
    
    // Sort attributes by shader location for logical ordering
    attributes.sort((a, b) => a.shaderLocation - b.shaderLocation);
    
    return {
        arrayStride: structLayout.size,
        stepMode: options.stepMode ?? 'vertex',
        attributes
    };
}

/**
 * Type-safe helper to generate vertex buffer layout for a specific schema type
 * 
 * @example
 * ```typescript
 * const positionColorLayout = positionColorNormalVertexSchema |> schemaToVertexBufferLayoutForType;
 * ```
 */
export function toVertexBufferLayoutForType<T extends Schema>(
    schema: T,
    options?: VertexBufferLayoutOptions
): GPUVertexBufferLayout {
    return toVertexBufferLayout(schema, options);
}
