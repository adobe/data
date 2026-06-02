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

// Under-relaxation: a body's simultaneous contacts are averaged (not summed), so
// a body in a dense pack can't overshoot by stacking independent push-outs.
const RELAX: f32 = 1.0;
// Energy budget: a hard per-body speed cap. Substepping already keeps the
// reconstructed velocities physical; this clamps any residual launch so kinetic
// energy can't run away (½m·v² bounded ⇔ |v| bounded).
const MAX_SPEED:  f32 = 40.0;
const MAX_ANGVEL: f32 = 30.0;
// Sleep: dissipate the last sliver of energy so a body in a dense contact graph
// settles fully instead of micro-jittering forever (the other end of the budget).
const SLEEP_LINEAR:  f32 = 0.35;
const SLEEP_ANGULAR: f32 = 0.35;

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

// Normalize a quaternion, falling back to the prior value if it collapsed to ~0.
// A zero-length quaternion would normalize to NaN, and a single NaN body
// poisons every neighbour it touches — the classic regional-explosion source.
fn safeQuat(q: vec4f, prevQ: vec4f) -> vec4f {
    let l = length(q);
    if (l < 1e-6) { return prevQ; }
    return q / l;
}

// --- integrate ---------------------------------------------------------------
@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.bodyCount) { return; }
    var x = posOf(i);
    let q = quatOf(i);
    let invM = invMassOf(i);
    var v = props[i * 4u].xyz;
    var w = props[i * 4u + 1u].xyz;

    // Containment backstop: a body that has escaped the world (a solver blow-up)
    // is snapped back and brought to rest. This stops a single runaway from
    // ballooning the scene-AABB reduction — which would collapse every Morton
    // code into one cell, degenerate the BVH, and explode the whole scene.
    let lim = P.binExtent + 5.0;
    let ceil = P.floorY + 400.0;
    if (x.x < -lim || x.x > lim || x.z < -lim || x.z > lim || x.y < P.floorY - 5.0 || x.y > ceil) {
        x = clamp(x, vec3f(-lim, P.floorY, -lim), vec3f(lim, ceil, lim));
        v = vec3f(0.0);
        w = vec3f(0.0);
    }

    prev[i * 2u]      = vec4f(x, 0.0);
    prev[i * 2u + 1u] = q;

    if (invM > 0.0) { v.y = v.y - P.gravity * P.dt; }
    let nx = x + v * P.dt;
    let nq = safeQuat(q + 0.5 * P.dt * qMul(vec4f(w, 0.0), q), q);

    poseOut[i * 2u]      = vec4f(nx, boundOf(i));
    poseOut[i * 2u + 1u] = nq;
    props[i * 4u]      = vec4f(v, invM);
    props[i * 4u + 1u] = vec4f(w, 0.0);
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
    dx: ptr<function, vec3f>, dq: ptr<function, vec4f>, cnt: ptr<function, f32>,
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
    *cnt = *cnt + 1.0;  // contacts are averaged (under-relaxed) by the caller
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

// Half-width of a box (axes a0/a1/a2, half-extents he) projected onto unit axis L.
fn boxExtent(a0: vec3f, a1: vec3f, a2: vec3f, he: vec3f, L: vec3f) -> f32 {
    return he.x * abs(dot(a0, L)) + he.y * abs(dot(a1, L)) + he.z * abs(dot(a2, L));
}

// Midpoint of the closest points between segments p1q1 and p2q2 (Ericson).
fn closestSeg(p1: vec3f, q1: vec3f, p2: vec3f, q2: vec3f) -> vec3f {
    let d1 = q1 - p1;
    let d2 = q2 - p2;
    let r = p1 - p2;
    let a = dot(d1, d1);
    let e = dot(d2, d2);
    let f = dot(d2, r);
    let c = dot(d1, r);
    let b = dot(d1, d2);
    let denom = a * e - b * b;
    var s = 0.0;
    if (denom > 1e-8) { s = clamp((b * f - c * e) / denom, 0.0, 1.0); }
    var tt = (b * s + f) / e;
    if (tt < 0.0) { tt = 0.0; s = clamp(-c / a, 0.0, 1.0); }
    else if (tt > 1.0) { tt = 1.0; s = clamp((b - c) / a, 0.0, 1.0); }
    return 0.5 * ((p1 + d1 * s) + (p2 + d2 * tt));
}

// Box-box contacts for body i against body j via SAT. The min-penetration axis
// gives the normal + depth (face axes preferred over edge crosses to avoid
// jitter). Face contacts emit the incident face's vertices as a manifold (no
// side-plane clip yet — depth is measured past the reference face plane); an
// edge-edge contact emits one point at the closest approach. All corrections are
// applied to body i only (write-self); body j's own thread handles its side.
fn solveBoxBox(
    xi: vec3f, qi: vec4f, invMi: f32, invIli: vec3f, hei: vec3f,
    xj: vec3f, qj: vec4f, invMj: f32, invIlj: vec3f, hej: vec3f,
    dx: ptr<function, vec3f>, dq: ptr<function, vec4f>, cnt: ptr<function, f32>,
) {
    var ai = array<vec3f, 3>(qRot(qi, vec3f(1, 0, 0)), qRot(qi, vec3f(0, 1, 0)), qRot(qi, vec3f(0, 0, 1)));
    var aj = array<vec3f, 3>(qRot(qj, vec3f(1, 0, 0)), qRot(qj, vec3f(0, 1, 0)), qRot(qj, vec3f(0, 0, 1)));
    let t = xj - xi;

    var minPen = 3.4e38;
    var axis = vec3f(0, 0, 1);
    var refI = true;   // reference face belongs to box i
    var faceK = 0u;    // index of the reference face axis
    var edge = false;
    var edgeK = 0u;
    var edgeL = 0u;

    // Face axes of i, then j.
    for (var k = 0u; k < 3u; k = k + 1u) {
        let L = ai[k];
        let pen = boxExtent(ai[0], ai[1], ai[2], hei, L) + boxExtent(aj[0], aj[1], aj[2], hej, L) - abs(dot(t, L));
        if (pen < 0.0) { return; }
        if (pen < minPen) { minPen = pen; axis = L; refI = true; faceK = k; edge = false; }
    }
    for (var l = 0u; l < 3u; l = l + 1u) {
        let L = aj[l];
        let pen = boxExtent(ai[0], ai[1], ai[2], hei, L) + boxExtent(aj[0], aj[1], aj[2], hej, L) - abs(dot(t, L));
        if (pen < 0.0) { return; }
        if (pen < minPen) { minPen = pen; axis = L; refI = false; faceK = l; edge = false; }
    }
    // Edge-edge axes (slightly biased so a near-tie prefers a face contact).
    for (var k = 0u; k < 3u; k = k + 1u) {
        for (var l = 0u; l < 3u; l = l + 1u) {
            var L = cross(ai[k], aj[l]);
            let len = length(L);
            if (len < 1e-6) { continue; }
            L = L / len;
            let pen = boxExtent(ai[0], ai[1], ai[2], hei, L) + boxExtent(aj[0], aj[1], aj[2], hej, L) - abs(dot(t, L));
            if (pen < 0.0) { return; }
            if (pen < minPen - 1e-3) { minPen = pen; axis = L; edge = true; edgeK = k; edgeL = l; }
        }
    }

    if (dot(t, axis) < 0.0) { axis = -axis; }  // orient i → j
    let nForI = -axis;                          // body i separates away from j

    if (edge) {
        // Centres of the two nearest parallel edges, then closest approach.
        var ci = xi;
        for (var m = 0u; m < 3u; m = m + 1u) {
            if (m != edgeK) { ci = ci + sign(dot(axis, ai[m])) * hei[m] * ai[m]; }
        }
        var cj = xj;
        for (var m = 0u; m < 3u; m = m + 1u) {
            if (m != edgeL) { cj = cj - sign(dot(axis, aj[m])) * hej[m] * aj[m]; }
        }
        let p = closestSeg(ci - hei[edgeK] * ai[edgeK], ci + hei[edgeK] * ai[edgeK],
                           cj - hej[edgeL] * aj[edgeL], cj + hej[edgeL] * aj[edgeL]);
        let w2 = otherW(xj, qj, invMj, invIlj, p, nForI);
        applyContact(xi, qi, invMi, invIli, p, nForI, minPen, w2, dx, dq, cnt);
        return;
    }

    // Face contact. Reference box owns the axis; incident box supplies the face.
    var refC = xi; var refHeK = hei[faceK]; var refN = axis;
    var incC = xj;
    var incA = aj; var incHe = hej;
    if (!refI) {
        refC = xj; refHeK = hej[faceK]; refN = -axis;
        incC = xi; incA = ai; incHe = hei;
    }

    // Incident face = inc face whose normal is most anti-parallel to refN.
    var m0 = 0u;
    var best = abs(dot(incA[0], refN));
    let d1a = abs(dot(incA[1], refN));
    let d2a = abs(dot(incA[2], refN));
    if (d1a > best) { best = d1a; m0 = 1u; }
    if (d2a > best) { best = d2a; m0 = 2u; }
    let incSign = -sign(dot(incA[m0], refN));
    let faceCenter = incC + incSign * incHe[m0] * incA[m0];
    let m1 = (m0 + 1u) % 3u;
    let m2 = (m0 + 2u) % 3u;
    let u = incHe[m1] * incA[m1];
    let v = incHe[m2] * incA[m2];

    var su = -1.0;
    for (var iu = 0u; iu < 2u; iu = iu + 1u) {
        var sv = -1.0;
        for (var iv = 0u; iv < 2u; iv = iv + 1u) {
            let vert = faceCenter + su * u + sv * v;
            let depth = refHeK - dot(vert - refC, refN);  // past the reference face plane
            if (depth > 0.0) {
                let w2 = otherW(xj, qj, invMj, invIlj, vert, nForI);
                applyContact(xi, qi, invMi, invIli, vert, nForI, depth, w2, dx, dq, cnt);
            }
            sv = sv + 2.0;
        }
        su = su + 2.0;
    }
}

// Project body i out of the floor (y = floorY) and the four bin walls
// (x,z = ±binExtent). Spheres contact at their support point; boxes at every
// corner that breaches a plane, giving a multi-point manifold for flat rest.
fn resolveStatic(
    shape: f32, xi: vec3f, qi: vec4f, invMi: f32, invIli: vec3f, he: vec3f,
    dx: ptr<function, vec3f>, dq: ptr<function, vec4f>, cnt: ptr<function, f32>,
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
                applyContact(xi, qi, invMi, invIli, xi - n * r, n, pen, 0.0, dx, dq, cnt);
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
                    applyContact(xi, qi, invMi, invIli, corner, n, pen, 0.0, dx, dq, cnt);
                }
            }
        }
    }
}

// LBVH read by the solver's traversal (built each frame in broadphase-compute).
@group(1) @binding(0) var<storage, read> bvhNodes:  array<vec4f>;  // 2 / node
@group(1) @binding(1) var<storage, read> bvhLeaves: array<u32>;    // sorted leaf → body id

// One contact pair: dispatch on the shapes of i and j and accumulate i's share.
fn solvePair(
    i: u32, j: u32, xi: vec3f, qi: vec4f, invMi: f32, invIli: vec3f, shi: f32, hei: vec3f,
    dx: ptr<function, vec3f>, dq: ptr<function, vec4f>, cnt: ptr<function, f32>,
) {
    if (j == i) { return; }
    let xj = posOf(j);
    let qj = quatOf(j);
    let invMj = invMassOf(j);
    let invIlj = invInertiaOf(j);
    let shj = shapeOf(j);
    let hej = halfExtentOf(j);

    if (shi == SHAPE_SPHERE && shj == SHAPE_SPHERE) {
        let sep = xi - xj;
        let dist = length(sep);
        let pen = (hei.x + hej.x) - dist;
        if (pen > 0.0 && dist > 1e-6) {
            let n = sep / dist;
            let point = xj + n * hej.x;
            let w2 = otherW(xj, qj, invMj, invIlj, point, n);
            applyContact(xi, qi, invMi, invIli, point, n, pen, w2, dx, dq, cnt);
        }
    } else if (shi == SHAPE_SPHERE && shj == SHAPE_BOX) {
        let cp = closestOnBox(xi, xj, qj, hej);
        let d = xi - cp;
        let dist = length(d);
        let pen = hei.x - dist;
        if (pen > 0.0 && dist > 1e-6) {
            let n = d / dist;
            let w2 = otherW(xj, qj, invMj, invIlj, cp, n);
            applyContact(xi, qi, invMi, invIli, cp, n, pen, w2, dx, dq, cnt);
        }
    } else if (shi == SHAPE_BOX && shj == SHAPE_SPHERE) {
        let cp = closestOnBox(xj, xi, qi, hei);
        let d = cp - xj;
        let dist = length(d);
        let pen = hej.x - dist;
        if (pen > 0.0 && dist > 1e-6) {
            let n = d / dist;  // from sphere j toward box i
            let w2 = otherW(xj, qj, invMj, invIlj, cp, n);
            applyContact(xi, qi, invMi, invIli, cp, n, pen, w2, dx, dq, cnt);
        }
    } else {
        solveBoxBox(xi, qi, invMi, invIli, hei, xj, qj, invMj, invIlj, hej, dx, dq, cnt);
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
    var cnt = 0.0;

    if (invMi > 0.0 && P.bodyCount >= 2u) {
        // Stackless-with-stack BVH traversal: gather candidates whose node AABB
        // overlaps body i's bounding box, then run the precise contact per leaf.
        let qmin = xi - vec3f(bri);
        let qmax = xi + vec3f(bri);
        let leafBase = P.bodyCount - 1u;
        var stack: array<u32, 64>;
        var sp = 0;
        stack[0] = 0u;  // root
        sp = 1;
        loop {
            if (sp <= 0) { break; }
            sp = sp - 1;
            let node = stack[sp];
            let nmin = bvhNodes[node * 2u].xyz;
            let nmax = bvhNodes[node * 2u + 1u].xyz;
            if (any(qmax < nmin) || any(qmin > nmax)) { continue; }
            if (node >= leafBase) {
                solvePair(i, bvhLeaves[node - leafBase], xi, qi, invMi, invIli, shi, hei, &dx, &dq, &cnt);
            } else if (sp <= 62) {
                stack[sp] = bitcast<u32>(bvhNodes[node * 2u].w);
                stack[sp + 1] = bitcast<u32>(bvhNodes[node * 2u + 1u].w);
                sp = sp + 2;
            }
        }
    }

    // Static world: floor + 4 bin walls, treated as immovable (wOther = 0).
    resolveStatic(shi, xi, qi, invMi, invIli, hei, &dx, &dq, &cnt);

    // Average this body's simultaneous corrections (under-relaxation): summing
    // independent per-contact push-outs overshoots in dense packs and boils.
    if (cnt > 0.0) {
        let inv = RELAX / cnt;
        dx = dx * inv;
        dq = dq * inv;
    }

    let nx = xi + dx;
    let nq = safeQuat(qi + dq, qi);
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

    var v = (x - px) / P.dt * P.damping;
    var dq = qMul(q, qConj(pq));
    if (dq.w < 0.0) { dq = -dq; }
    var w = 2.0 * dq.xyz / P.dt * P.damping;

    // Energy budget: cap speed + spin so a residual bad contact can't launch.
    let speed = length(v);
    if (speed > MAX_SPEED) { v = v * (MAX_SPEED / speed); }
    let spin = length(w);
    if (spin > MAX_ANGVEL) { w = w * (MAX_ANGVEL / spin); }
    // Sleep near-rest bodies so dense packs settle fully instead of shimmering.
    if (speed < SLEEP_LINEAR && spin < SLEEP_ANGULAR) {
        v = vec3f(0.0);
        w = vec3f(0.0);
    }

    props[i * 4u]      = vec4f(v, invMassOf(i));
    props[i * 4u + 1u] = vec4f(w, 0.0);
}
`;
