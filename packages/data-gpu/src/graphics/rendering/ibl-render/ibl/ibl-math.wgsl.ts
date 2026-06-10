// © 2026 Adobe. MIT License. See /LICENSE for details.

// Shared WGSL math for IBL precomputation passes.
// - cube_uv_to_dir: WebGPU cube layer (face 0..5) + 2D uv → world-space direction
// - hammersley / radical_inverse_vdc: low-discrepancy 2D sample sequence
// - importance_sample_ggx: GGX-distributed half-vector in tangent space, returned in world space

export default /* wgsl */ `
const PI: f32 = 3.14159265359;

fn cube_uv_to_dir(face: u32, uv: vec2f) -> vec3f {
    let p = uv * 2.0 - vec2f(1.0);
    var dir: vec3f;
    switch face {
        case 0u: { dir = vec3f( 1.0, -p.y, -p.x); }
        case 1u: { dir = vec3f(-1.0, -p.y,  p.x); }
        case 2u: { dir = vec3f( p.x,  1.0,  p.y); }
        case 3u: { dir = vec3f( p.x, -1.0, -p.y); }
        case 4u: { dir = vec3f( p.x, -p.y,  1.0); }
        default: { dir = vec3f(-p.x, -p.y, -1.0); }
    }
    return normalize(dir);
}

fn radical_inverse_vdc(bitsIn: u32) -> f32 {
    var bits = bitsIn;
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(i: u32, n: u32) -> vec2f {
    return vec2f(f32(i) / f32(n), radical_inverse_vdc(i));
}

fn importance_sample_ggx(xi: vec2f, N: vec3f, roughness: f32) -> vec3f {
    let a = roughness * roughness;
    let phi = 2.0 * PI * xi.x;
    let cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
    let H_tangent = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

    let up = select(vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), abs(N.z) < 0.999);
    let tangent = normalize(cross(up, N));
    let bitangent = cross(N, tangent);

    return normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
}

fn g_smith_ibl(nDotV: f32, nDotL: f32, roughness: f32) -> f32 {
    let a = roughness;
    let k = (a * a) / 2.0;
    let gv = nDotV / (nDotV * (1.0 - k) + k);
    let gl = nDotL / (nDotL * (1.0 - k) + k);
    return gv * gl;
}
`;
