// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Phase D rigid-body XPBD solver — spheres and oriented boxes.
 *
 * Bodies carry orientation (quaternion) + angular velocity + diagonal inverse
 * inertia, so box contacts produce torque and boxes tumble and rest. Four entry
 * points dispatched per frame:
 *
 *   integrate  — predict pose (position + orientation) from linear/angular
 *                velocity + gravity; snapshot the previous pose.
 *   report     — flag-gated collision events (bounding-sphere overlap).
 *   solve      — Jacobi position-based contact resolution (run K iterations):
 *                each body reads its neighbours read-only, generates contacts
 *                (sphere-sphere, sphere-box; box-box in Phase D2), and
 *                accumulates a mass-weighted positional + angular correction
 *                that it applies to ITSELF only — race-free write-self. Then
 *                projects out of the static world (floor + bin walls).
 *   finalize   — derive linear + angular velocity from the net pose change.
 *
 * State is packed to stay under the 8-storage-buffer binding limit:
 *   pose  (2 vec4f / body, ping-pong): [pos.xyz + boundingRadius, quat]
 *   prev  (2 vec4f / body):            [prevPos.xyz, prevQuat]
 *   props (4 vec4f / body):            [vel.xyz + invMass, angVel.xyz,
 *                                       invInertiaLocal.xyz, halfExtent.xyz + shapeEnum]
 *
 * NEIGHBOUR SEARCH IS BRUTE-FORCE O(N²) — a placeholder for the LBVH broadphase.
 */
export const physicsComputeShader = /* wgsl */ `
struct Params {
    dt:              f32,
    gravity:         f32,
    floorY:          f32,
    binExtent:       f32,
    damping:         f32,
    reportThreshold: f32,
    bodyCount:       u32,
    maxEvents:       u32,
}

const SHAPE_SPHERE: f32 = 0.0;
const SHAPE_BOX:    f32 = 1.0;
const REPORT_BODY_HITS: u32 = 1u;

struct CollisionEvent { a: u32, b: u32, penetration: f32, _pad: u32, }
struct Events { count: atomic<u32>, _p0: u32, _p1: u32, _p2: u32, data: array<CollisionEvent>, }

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       poseIn:  array<vec4f>;  // 2 / body
@group(0) @binding(2) var<storage, read_write> poseOut: array<vec4f>;  // 2 / body
@group(0) @binding(3) var<storage, read_write> prev:    array<vec4f>;  // 2 / body
@group(0) @binding(4) var<storage, read_write> props:   array<vec4f>;  // 4 / body
@group(0) @binding(5) var<storage, read>       flags:   array<u32>;
@group(0) @binding(6) var<storage, read_write> events:  Events;

// --- accessors ---------------------------------------------------------------
fn posOf(i: u32) -> vec3f    { return poseIn[i * 2u].xyz; }
fn boundOf(i: u32) -> f32    { return poseIn[i * 2u].w; }
fn quatOf(i: u32) -> vec4f   { return poseIn[i * 2u + 1u]; }
fn invMassOf(i: u32) -> f32  { return props[i * 4u].w; }
fn invInertiaOf(i: u32) -> vec3f { return props[i * 4u + 2u].xyz; }
fn halfExtentOf(i: u32) -> vec3f { return props[i * 4u + 3u].xyz; }
fn shapeOf(i: u32) -> f32    { return props[i * 4u + 3u].w; }

// --- quaternion helpers ------------------------------------------------------
fn qMul(a: vec4f, b: vec4f) -> vec4f {
    return vec4f(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}
fn qConj(q: vec4f) -> vec4f { return vec4f(-q.xyz, q.w); }
fn qRot(q: vec4f, v: vec3f) -> vec3f {
    let t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}
// World-space inverse inertia applied to u: R · (invIlocal ⊙ (Rᵀ · u)).
fn applyInvInertia(q: vec4f, invIl: vec3f, u: vec3f) -> vec3f {
    return qRot(q, invIl * qRot(qConj(q), u));
}

// --- integrate ---------------------------------------------------------------
@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }
    let x = posOf(i);
    let q = quatOf(i);
    prev[i * 2u]      = vec4f(x, 0.0);
    prev[i * 2u + 1u] = q;

    let invM = invMassOf(i);
    var v = props[i * 4u].xyz;
    if (invM > 0.0) { v.y = v.y - P.gravity * P.dt; }
    let nx = x + v * P.dt;

    let w = props[i * 4u + 1u].xyz;
    let nq = normalize(q + 0.5 * P.dt * qMul(vec4f(w, 0.0), q));

    poseOut[i * 2u]      = vec4f(nx, boundOf(i));
    poseOut[i * 2u + 1u] = nq;
    props[i * 4u] = vec4f(v, invM);
}

// --- flag-gated collision events (bounding-sphere overlap on predicted pose) --
@compute @workgroup_size(64)
fn report(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }
    if ((flags[i] & REPORT_BODY_HITS) == 0u) { return; }
    let x = posOf(i);
    let r = boundOf(i);
    for (var j = 0u; j < P.bodyCount; j = j + 1u) {
        if (j == i) { continue; }
        let d = x - posOf(j);
        let dist = length(d);
        let pen = (r + boundOf(j)) - dist;
        if (pen > P.reportThreshold) {
            let slot = atomicAdd(&events.count, 1u);
            if (slot < P.maxEvents) { events.data[slot] = CollisionEvent(i, j, pen, 0u); }
        }
    }
}

// --- contact application (Jacobi: apply this body's share, treat other read-only)
// Accumulates positional (dx) + angular (dq) correction for body i at a single
// contact. wOther = 0 makes the other side immovable (static world).
fn applyContact(
    xi: vec3f, qi: vec4f, invMi: f32, invIli: vec3f,
    point: vec3f, n: vec3f, depth: f32, wOther: f32,
    dx: ptr<function, vec3f>, dq: ptr<function, vec4f>,
) {
    let ri = point - xi;
    let rn = cross(ri, n);
    let wi = invMi + dot(rn, applyInvInertia(qi, invIli, rn));
    let wsum = wi + wOther;
    if (wsum <= 0.0) { return; }
    let lambda = depth / wsum;
    let p = lambda * n;
    *dx = *dx + invMi * p;
    let dw = applyInvInertia(qi, invIli, cross(ri, p));
    *dq = *dq + 0.5 * qMul(vec4f(dw, 0.0), qi);
}

// Generalised inverse mass of the other body along n at its contact arm — used
// to split the correction by mass between two dynamic bodies.
fn otherW(xj: vec3f, qj: vec4f, invMj: f32, invIlj: vec3f, point: vec3f, n: vec3f) -> f32 {
    let rj = point - xj;
    let rn = cross(rj, n);
    return invMj + dot(rn, applyInvInertia(qj, invIlj, rn));
}

// Closest point on box (centre xb, orientation qb, half-extents he) to point w.
fn closestOnBox(w: vec3f, xb: vec3f, qb: vec4f, he: vec3f) -> vec3f {
    let local = qRot(qConj(qb), w - xb);
    let clamped = clamp(local, -he, he);
    return xb + qRot(qb, clamped);
}

// Project body i out of the floor (y = floorY) and the four bin walls
// (x,z = ±binExtent). Spheres contact at their support point; boxes at every
// corner that breaches a plane, giving a multi-point manifold for flat rest.
fn resolveStatic(
    shape: f32, xi: vec3f, qi: vec4f, invMi: f32, invIli: vec3f, he: vec3f,
    dx: ptr<function, vec3f>, dq: ptr<function, vec4f>,
) {
    if (invMi <= 0.0) { return; }
    let h = P.binExtent;
    // plane index 0..4: floor, -x, +x, -z, +z. Normal points into the valid region.
    var normals = array<vec3f, 5>(
        vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), vec3f(-1.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, -1.0),
    );
    var offsets = array<f32, 5>(P.floorY, -h, -h, -h, -h);

    if (shape == SHAPE_SPHERE) {
        let r = he.x;
        for (var k = 0u; k < 5u; k = k + 1u) {
            let n = normals[k];
            let pen = offsets[k] - (dot(xi, n) - r);  // >0 when the support point is past the plane
            if (pen > 0.0) {
                applyContact(xi, qi, invMi, invIli, xi - n * r, n, pen, 0.0, dx, dq);
            }
        }
    } else {
        // 8 box corners in world space.
        for (var c = 0u; c < 8u; c = c + 1u) {
            let s = vec3f(
                select(-1.0, 1.0, (c & 1u) != 0u),
                select(-1.0, 1.0, (c & 2u) != 0u),
                select(-1.0, 1.0, (c & 4u) != 0u),
            );
            let corner = xi + qRot(qi, he * s);
            for (var k = 0u; k < 5u; k = k + 1u) {
                let n = normals[k];
                let pen = offsets[k] - dot(corner, n);
                if (pen > 0.0) {
                    applyContact(xi, qi, invMi, invIli, corner, n, pen, 0.0, dx, dq);
                }
            }
        }
    }
}

// --- solve -------------------------------------------------------------------
@compute @workgroup_size(64)
fn solve(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }
    let xi = posOf(i);
    let qi = quatOf(i);
    let invMi = invMassOf(i);
    let invIli = invInertiaOf(i);
    let shi = shapeOf(i);
    let hei = halfExtentOf(i);
    let bri = boundOf(i);

    var dx = vec3f(0.0);
    var dq = vec4f(0.0);

    if (invMi > 0.0) {
        for (var j = 0u; j < P.bodyCount; j = j + 1u) {
            if (j == i) { continue; }
            let xj = posOf(j);
            let brj = boundOf(j);
            let sep = xi - xj;
            if (dot(sep, sep) > (bri + brj) * (bri + brj)) { continue; }  // bounding reject
            let qj = quatOf(j);
            let invMj = invMassOf(j);
            let invIlj = invInertiaOf(j);
            let shj = shapeOf(j);
            let hej = halfExtentOf(j);

            if (shi == SHAPE_SPHERE && shj == SHAPE_SPHERE) {
                let dist = length(sep);
                let pen = (hei.x + hej.x) - dist;
                if (pen > 0.0 && dist > 1e-6) {
                    let n = sep / dist;
                    let point = xj + n * hej.x;
                    let w2 = otherW(xj, qj, invMj, invIlj, point, n);
                    applyContact(xi, qi, invMi, invIli, point, n, pen, w2, &dx, &dq);
                }
            } else if (shi == SHAPE_SPHERE && shj == SHAPE_BOX) {
                let cp = closestOnBox(xi, xj, qj, hej);
                let d = xi - cp;
                let dist = length(d);
                let pen = hei.x - dist;
                if (pen > 0.0 && dist > 1e-6) {
                    let n = d / dist;
                    let w2 = otherW(xj, qj, invMj, invIlj, cp, n);
                    applyContact(xi, qi, invMi, invIli, cp, n, pen, w2, &dx, &dq);
                }
            } else if (shi == SHAPE_BOX && shj == SHAPE_SPHERE) {
                let cp = closestOnBox(xj, xi, qi, hei);
                let d = cp - xj;
                let dist = length(d);
                let pen = hej.x - dist;
                if (pen > 0.0 && dist > 1e-6) {
                    let n = d / dist;  // from sphere j toward box i
                    let w2 = otherW(xj, qj, invMj, invIlj, cp, n);
                    applyContact(xi, qi, invMi, invIli, cp, n, pen, w2, &dx, &dq);
                }
            }
            // box-box: Phase D2.
        }
    }

    // Static world: floor + 4 bin walls, treated as immovable (wOther = 0).
    resolveStatic(shi, xi, qi, invMi, invIli, hei, &dx, &dq);

    let nx = xi + dx;
    let nq = normalize(qi + dq);
    poseOut[i * 2u]      = vec4f(nx, bri);
    poseOut[i * 2u + 1u] = nq;
}

// --- finalize ----------------------------------------------------------------
@compute @workgroup_size(64)
fn finalize(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }
    let x = posOf(i);
    let q = quatOf(i);
    let px = prev[i * 2u].xyz;
    let pq = prev[i * 2u + 1u];

    let v = (x - px) / P.dt * P.damping;
    var dq = qMul(q, qConj(pq));
    if (dq.w < 0.0) { dq = -dq; }
    let w = 2.0 * dq.xyz / P.dt * P.damping;

    props[i * 4u]      = vec4f(v, invMassOf(i));
    props[i * 4u + 1u] = vec4f(w, 0.0);
}
`;
