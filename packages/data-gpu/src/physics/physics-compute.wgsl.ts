// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Phase B XPBD sphere solver. Three entry points dispatched per frame:
 *
 *   integrate  — predict positions from velocity + gravity, snapshot prevPos.
 *   solve      — Jacobi position-based contact resolution (run K iterations):
 *                each body reads neighbours, accumulates a mass-weighted
 *                push-out correction, applies it, then projects out of the
 *                static world (floor + bin walls). Writes only its own row, so
 *                it is race-free — exactly the boids write-self pattern.
 *   finalize   — derive velocity from the net position change (XPBD), damped.
 *
 * State is split across separate buffers so the solver's hot loop reads only
 * positions+radius (16 B/body): `pos` (ping-pong, xyz+radius), `vel`
 * (xyz+invMass), `prevPos` (xyz).
 *
 * NEIGHBOUR SEARCH IS BRUTE-FORCE O(N²) — a placeholder for the LBVH broadphase.
 * The solver loop is broadphase-agnostic; swapping the inner `for j` scan for a
 * BVH traversal changes nothing else.
 */
export const physicsComputeShader = /* wgsl */ `
struct Params {
    dt:         f32,
    gravity:    f32,
    floorY:     f32,
    halfExtent: f32,
    damping:    f32,
    _pad0:      f32,
    bodyCount:  u32,
    _pad1:      u32,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       posIn:   array<vec4f>;  // xyz + radius
@group(0) @binding(2) var<storage, read_write> posOut:  array<vec4f>;
@group(0) @binding(3) var<storage, read_write> vel:     array<vec4f>;  // xyz + invMass
@group(0) @binding(4) var<storage, read_write> prevPos: array<vec4f>;  // xyz

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }
    let p = posIn[i];
    prevPos[i] = vec4f(p.xyz, 0.0);
    var v = vel[i].xyz;
    v.y = v.y - P.gravity * P.dt;
    posOut[i] = vec4f(p.xyz + v * P.dt, p.w);
    vel[i] = vec4f(v, vel[i].w);
}

fn resolveStatic(p: ptr<function, vec3f>, r: f32) {
    if ((*p).y - r < P.floorY) { (*p).y = P.floorY + r; }
    let h = P.halfExtent;
    if ((*p).x - r < -h) { (*p).x = -h + r; }
    if ((*p).x + r >  h) { (*p).x =  h - r; }
    if ((*p).z - r < -h) { (*p).z = -h + r; }
    if ((*p).z + r >  h) { (*p).z =  h - r; }
}

@compute @workgroup_size(64)
fn solve(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }
    let me = posIn[i];
    var p = me.xyz;
    let r = me.w;
    let wi = vel[i].w;            // inverse mass

    var corr = vec3f(0.0);
    // BRUTE FORCE — replace this scan with an LBVH traversal.
    for (var j = 0u; j < P.bodyCount; j = j + 1u) {
        if (j == i) { continue; }
        let o = posIn[j];
        let d = p - o.xyz;
        let dist2 = dot(d, d);
        let rr = r + o.w;
        if (dist2 < rr * rr && dist2 > 1e-8) {
            let dist = sqrt(dist2);
            let wj = vel[j].w;
            let denom = wi + wj;
            let share = select(0.5, wi / denom, denom > 0.0);
            corr = corr + (d / dist) * (rr - dist) * share;
        }
    }
    p = p + corr;
    resolveStatic(&p, r);
    posOut[i] = vec4f(p, r);
}

@compute @workgroup_size(64)
fn finalize(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }
    let p = posIn[i].xyz;
    let v = (p - prevPos[i].xyz) / P.dt * P.damping;
    vel[i] = vec4f(v, vel[i].w);
}
`;
