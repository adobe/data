// © 2026 Adobe. MIT License. See /LICENSE for details.

// Shared WGSL fragment: Cook-Torrance metallic-roughness BRDF building blocks.
// Concatenated into the direct and (future) IBL shader modules so both paths
// agree on the math.

export default /* wgsl */ `
const PI: f32 = 3.14159265359;
const MIN_ROUGHNESS: f32 = 0.04;

// Trowbridge-Reitz / GGX normal distribution.
fn d_ggx(nDotH: f32, alpha: f32) -> f32 {
    let a2 = alpha * alpha;
    let denom = nDotH * nDotH * (a2 - 1.0) + 1.0;
    return a2 / (PI * denom * denom);
}

// Smith G with Schlick-GGX.
fn g_smith(nDotV: f32, nDotL: f32, alpha: f32) -> f32 {
    let k = (alpha + 1.0) * (alpha + 1.0) / 8.0;
    let gv = nDotV / (nDotV * (1.0 - k) + k);
    let gl = nDotL / (nDotL * (1.0 - k) + k);
    return gv * gl;
}

// Schlick Fresnel.
fn f_schlick(vDotH: f32, f0: vec3f) -> vec3f {
    let f = pow(clamp(1.0 - vDotH, 0.0, 1.0), 5.0);
    return f0 + (vec3f(1.0) - f0) * f;
}

// Roughness-aware Schlick for IBL: avoids over-strong rim at high roughness.
fn f_schlick_roughness(nDotV: f32, f0: vec3f, roughness: f32) -> vec3f {
    let r = vec3f(1.0 - roughness);
    return f0 + (max(r, f0) - f0) * pow(max(1.0 - nDotV, 0.0), 5.0);
}

// Narkowicz ACES filmic tonemap fit. Cheap, looks clearly filmic.
fn tone_map_aces(x: vec3f) -> vec3f {
    let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}
`;
