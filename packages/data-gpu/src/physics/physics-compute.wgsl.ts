// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Phase A XPBD integration kernel.
 *
 * Each thread owns one body and integrates it through all substeps in
 * registers, reading from `bodiesIn` and writing to `bodiesOut` (ping-pong).
 * Phase A has no body-body interaction, so the write-self pattern is trivially
 * race-free and needs no spatial structure. Collision is against the static
 * world only — a ground plane plus four bin walls — resolved as velocity
 * reflection with restitution + tangential friction.
 *
 * Body layout (2 × vec4f, 32 bytes):
 *   pos.xyz = world position, pos.w = radius
 *   vel.xyz = linear velocity, vel.w = inverse mass (unused in Phase A)
 *
 * Phase B layers position-based contact constraints (body-body via the LBVH)
 * on top of this substep loop.
 */
export const physicsComputeShader = /* wgsl */ `
struct Params {
    dt:          f32,
    gravity:     f32,
    floorY:      f32,
    halfExtent:  f32,   // bin half-size in x and z
    restitution: f32,
    friction:    f32,
    substeps:    u32,
    bodyCount:   u32,
}

struct Body {
    pos: vec4f,   // xyz position, w = radius
    vel: vec4f,   // xyz velocity, w = inverse mass
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       bodiesIn:  array<Body>;
@group(0) @binding(2) var<storage, read_write> bodiesOut: array<Body>;

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }

    let body = bodiesIn[i];
    var pos = body.pos.xyz;
    let r   = body.pos.w;
    var vel = body.vel.xyz;

    let sdt = P.dt / f32(P.substeps);
    let h   = P.halfExtent;

    for (var s = 0u; s < P.substeps; s = s + 1u) {
        // Semi-implicit Euler: gravity, then advance.
        vel.y = vel.y - P.gravity * sdt;
        pos = pos + vel * sdt;

        // Ground plane (half-space at floorY).
        if (pos.y - r < P.floorY) {
            pos.y = P.floorY + r;
            if (vel.y < 0.0) { vel.y = -vel.y * P.restitution; }
            vel.x = vel.x * P.friction;
            vel.z = vel.z * P.friction;
        }
        // Bin walls in x.
        if (pos.x - r < -h) { pos.x = -h + r; if (vel.x < 0.0) { vel.x = -vel.x * P.restitution; } }
        if (pos.x + r >  h) { pos.x =  h - r; if (vel.x > 0.0) { vel.x = -vel.x * P.restitution; } }
        // Bin walls in z.
        if (pos.z - r < -h) { pos.z = -h + r; if (vel.z < 0.0) { vel.z = -vel.z * P.restitution; } }
        if (pos.z + r >  h) { pos.z =  h - r; if (vel.z > 0.0) { vel.z = -vel.z * P.restitution; } }
    }

    bodiesOut[i] = Body(vec4f(pos, r), vec4f(vel, body.vel.w));
}
`;
