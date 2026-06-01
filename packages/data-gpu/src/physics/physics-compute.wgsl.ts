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
    dt:              f32,
    gravity:         f32,
    floorY:          f32,
    halfExtent:      f32,
    damping:         f32,
    reportThreshold: f32,  // min penetration that emits a collision event
    bodyCount:       u32,
    maxEvents:       u32,
}

// Flag bits, packed per body in the flags buffer.
const REPORT_BODY_HITS: u32 = 1u;

// Appended on the GPU, drained on the CPU. 16-byte header keeps the records
// array 16-byte aligned; each record is one CollisionEvent.
struct CollisionEvent {
    a:           u32,
    b:           u32,
    penetration: f32,
    _pad:        u32,
}
struct Events {
    count: atomic<u32>,
    _p0:   u32,
    _p1:   u32,
    _p2:   u32,
    data:  array<CollisionEvent>,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       posIn:   array<vec4f>;  // xyz + radius
@group(0) @binding(2) var<storage, read_write> posOut:  array<vec4f>;
@group(0) @binding(3) var<storage, read_write> vel:     array<vec4f>;  // xyz + invMass
@group(0) @binding(4) var<storage, read_write> prevPos: array<vec4f>;  // xyz
@group(0) @binding(5) var<storage, read>       flags:   array<u32>;
@group(0) @binding(6) var<storage, read_write> events:  Events;

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

// Flag-gated collision reporting. Runs once per frame on the predicted
// (post-integrate, pre-solve) positions, where impact penetrations are
// largest. Only bodies carrying REPORT_BODY_HITS emit; cost is therefore
// proportional to the number of flagged bodies, not the body count. The
// reportThreshold filters out resting micro-overlaps so only real impacts
// are logged. atomicAdd reserves a slot; records past maxEvents are dropped.
@compute @workgroup_size(64)
fn report(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }
    if ((flags[i] & REPORT_BODY_HITS) == 0u) { return; }
    let me = posIn[i];
    let r = me.w;
    for (var j = 0u; j < P.bodyCount; j = j + 1u) {
        if (j == i) { continue; }
        let o = posIn[j];
        let d = me.xyz - o.xyz;
        let dist = length(d);
        let pen = (r + o.w) - dist;
        if (pen > P.reportThreshold) {
            let slot = atomicAdd(&events.count, 1u);
            if (slot < P.maxEvents) {
                events.data[slot] = CollisionEvent(i, j, pen, 0u);
            }
        }
    }
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
