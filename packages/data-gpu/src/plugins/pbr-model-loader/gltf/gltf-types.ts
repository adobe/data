// © 2026 Adobe. MIT License. See /LICENSE for details.

// Minimal subset of glTF 2.0 schema fields we actually consume.
// Spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

export interface GltfAsset {
    asset: { version: string };
    scene?: number;
    scenes?: GltfScene[];
    nodes?: GltfNode[];
    meshes?: GltfMesh[];
    skins?: GltfSkin[];
    materials?: GltfMaterial[];
    textures?: GltfTexture[];
    images?: GltfImage[];
    samplers?: GltfSampler[];
    accessors?: GltfAccessor[];
    bufferViews?: GltfBufferView[];
    buffers?: GltfBuffer[];
    animations?: GltfAnimation[];
}

export interface GltfAnimation {
    name?: string;
    channels: GltfAnimationChannel[];
    samplers: GltfAnimationSampler[];
}

export interface GltfAnimationChannel {
    sampler: number;
    target: { node: number; path: "translation" | "rotation" | "scale" | "weights" };
}

export interface GltfAnimationSampler {
    input: number;   // accessor → keyframe times (Float32Array)
    output: number;  // accessor → keyframe values
    interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
}

export interface GltfScene {
    nodes?: number[];
}

export interface GltfNode {
    name?: string;
    mesh?: number;
    skin?: number;
    children?: number[];
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    matrix?: number[];
}

export interface GltfMesh {
    name?: string;
    primitives: GltfPrimitive[];
}

export interface GltfPrimitive {
    attributes: {
        POSITION: number;
        NORMAL?: number;
        TANGENT?: number;
        TEXCOORD_0?: number;
        JOINTS_0?: number;
        WEIGHTS_0?: number;
        [key: string]: number | undefined;
    };
    indices?: number;
    material?: number;
    mode?: number; // default 4 (triangles)
}

export interface GltfSkin {
    name?: string;
    inverseBindMatrices?: number;  // accessor index → array of mat4
    skeleton?: number;             // root joint node index
    joints: number[];              // ordered list of node indices that are joints
}

export interface GltfMaterial {
    name?: string;
    pbrMetallicRoughness?: {
        baseColorFactor?: [number, number, number, number];
        baseColorTexture?: { index: number; texCoord?: number };
        metallicFactor?: number;
        roughnessFactor?: number;
        metallicRoughnessTexture?: { index: number; texCoord?: number };
    };
    normalTexture?: { index: number; texCoord?: number; scale?: number };
    occlusionTexture?: { index: number; texCoord?: number; strength?: number };
    emissiveTexture?: { index: number; texCoord?: number };
    emissiveFactor?: [number, number, number];
    alphaMode?: "OPAQUE" | "MASK" | "BLEND";
    alphaCutoff?: number;
    doubleSided?: boolean;
}

export interface GltfTexture {
    sampler?: number;
    source?: number;
}

export interface GltfImage {
    name?: string;
    mimeType?: string;
    bufferView?: number;
    uri?: string;
}

export interface GltfSampler {
    magFilter?: number;
    minFilter?: number;
    wrapS?: number;
    wrapT?: number;
}

export interface GltfAccessor {
    bufferView?: number;
    byteOffset?: number;
    componentType: number; // 5120..5126
    count: number;
    type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT2" | "MAT3" | "MAT4";
    normalized?: boolean;
    min?: number[];
    max?: number[];
}

export interface GltfBufferView {
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
    target?: number;
}

export interface GltfBuffer {
    byteLength: number;
    uri?: string;
}

// glTF componentType constants
export const COMPONENT_TYPE = {
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
} as const;

export const ACCESSOR_TYPE_COMPONENTS: Record<GltfAccessor["type"], number> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16,
};
