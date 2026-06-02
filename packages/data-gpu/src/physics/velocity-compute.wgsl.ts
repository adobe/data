// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * XPBD velocity pass (Müller et al. 2020, §3.5), run once per substep after the
 * position solve + finalize. Each body re-traverses the LBVH (write-self, no
 * atomics) and, per contact, corrects the *normal* relative velocity toward the
 * restitution target −e·v_approach — where v_approach is the true pre-solve
 * relative velocity (read from `velStart`), not the Δx/dt reconstruction. This
 * gives real, material-driven bounce and removes the resting jitter that the
 * position-derived velocity injected.
 *
 * Restitution `e` per material comes from `matProps` (indexed by the material id
 * stored in a body's invInertia.w); contacts combine the two with `max`. Friction
 * lands in S2b. Body-body contacts use a single representative point + the SAT
 * normal (adequate for the velocity response); the static world is per-plane.
 *
 * Geometry helpers are duplicated from physics-compute (WGSL has no modules).
 */
export const velocityComputeShader = /* wgsl */ `
struct VParams {
    dt:               f32,
    worldRestitution: f32,
    worldFriction:    f32,
    _p0:              f32,
    floorY:           f32,
    binExtent:        f32,
    bodyCount:        u32,
    _p1:              u32,
}

const SHAPE_SPHERE: f32 = 0.0;
const SHAPE_BOX:    f32 = 1.0;
// Below this approach speed, restitution is suppressed — otherwise the tiny
// gravity-induced contact velocity each substep makes resting bodies bounce
// forever. Sits safely above gravity·dt.
// Restitution only fires above this approach speed. Set well above the jostle
// velocity of a settling pack, so persistent dense contacts don't pump energy
// (a substitute for per-contact age caching) while genuine impacts still bounce.
const REST_THRESHOLD: f32 = 4.0;
// Sleep thresholds — applied at the very end so restitution/friction can't undo
// them (this pass is the last to touch velocity each substep).
const SLEEP_LINEAR:  f32 = 0.35;
const SLEEP_ANGULAR: f32 = 0.35;

@group(0) @binding(0) var<uniform> V: VParams;
@group(0) @binding(1) var<storage, read>       pose:     array<vec4f>;  // 2 / body
@group(0) @binding(2) var<storage, read_write> props:    array<vec4f>;  // 4 / body
@group(0) @binding(3) var<storage, read>       velStart: array<vec4f>;  // 2 / body: v, ω pre-solve
@group(0) @binding(4) var<storage, read>       matProps: array<vec4f>;  // per material: restitution, friction, compliance, _
@group(1) @binding(0) var<storage, read>       bvhNodes:  array<vec4f>;
@group(1) @binding(1) var<storage, read>       bvhLeaves: array<u32>;

fn posOf(i: u32) -> vec3f    { return pose[i * 2u].xyz; }
fn boundOf(i: u32) -> f32    { return pose[i * 2u].w; }
fn quatOf(i: u32) -> vec4f   { return pose[i * 2u + 1u]; }
fn velOf(i: u32) -> vec3f    { return props[i * 4u].xyz; }
fn invMassOf(i: u32) -> f32  { return props[i * 4u].w; }
fn angOf(i: u32) -> vec3f    { return props[i * 4u + 1u].xyz; }
fn invInertiaOf(i: u32) -> vec3f { return props[i * 4u + 2u].xyz; }
fn matOf(i: u32) -> u32      { return u32(props[i * 4u + 2u].w); }
fn halfExtentOf(i: u32) -> vec3f { return props[i * 4u + 3u].xyz; }
fn shapeOf(i: u32) -> f32    { return props[i * 4u + 3u].w; }
fn velStartOf(i: u32) -> vec3f { return velStart[i * 2u].xyz; }
fn angStartOf(i: u32) -> vec3f { return velStart[i * 2u + 1u].xyz; }
fn restitutionOf(i: u32) -> f32 { return matProps[matOf(i)].x; }
fn frictionOf(i: u32) -> f32 { return matProps[matOf(i)].y; }

fn qConj(q: vec4f) -> vec4f { return vec4f(-q.xyz, q.w); }
fn qRot(q: vec4f, v: vec3f) -> vec3f {
    let t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}
fn applyInvInertia(q: vec4f, invIl: vec3f, u: vec3f) -> vec3f {
    return qRot(q, invIl * qRot(qConj(q), u));
}
fn closestOnBox(w: vec3f, xb: vec3f, qb: vec4f, he: vec3f) -> vec3f {
    let clamped = clamp(qRot(qConj(qb), w - xb), -he, he);
    return xb + qRot(qb, clamped);
}
fn boxExtent(a0: vec3f, a1: vec3f, a2: vec3f, he: vec3f, L: vec3f) -> f32 {
    return he.x * abs(dot(a0, L)) + he.y * abs(dot(a1, L)) + he.z * abs(dot(a2, L));
}

struct Contact { n: vec3f, point: vec3f, hit: bool }

// SAT normal (oriented j→i, i's separation direction) + a representative point.
fn boxBoxContact(xi: vec3f, qi: vec4f, hei: vec3f, xj: vec3f, qj: vec4f, hej: vec3f) -> Contact {
    var out: Contact;
    out.hit = false;
    var ai = array<vec3f, 3>(qRot(qi, vec3f(1, 0, 0)), qRot(qi, vec3f(0, 1, 0)), qRot(qi, vec3f(0, 0, 1)));
    var aj = array<vec3f, 3>(qRot(qj, vec3f(1, 0, 0)), qRot(qj, vec3f(0, 1, 0)), qRot(qj, vec3f(0, 0, 1)));
    let t = xj - xi;
    var minPen = 3.4e38;
    var axis = vec3f(0, 0, 1);
    for (var k = 0u; k < 3u; k = k + 1u) {
        let L = ai[k];
        let pen = boxExtent(ai[0], ai[1], ai[2], hei, L) + boxExtent(aj[0], aj[1], aj[2], hej, L) - abs(dot(t, L));
        if (pen < 0.0) { return out; }
        if (pen < minPen) { minPen = pen; axis = L; }
    }
    for (var l = 0u; l < 3u; l = l + 1u) {
        let L = aj[l];
        let pen = boxExtent(ai[0], ai[1], ai[2], hei, L) + boxExtent(aj[0], aj[1], aj[2], hej, L) - abs(dot(t, L));
        if (pen < 0.0) { return out; }
        if (pen < minPen) { minPen = pen; axis = L; }
    }
    for (var k = 0u; k < 3u; k = k + 1u) {
        for (var l = 0u; l < 3u; l = l + 1u) {
            var L = cross(ai[k], aj[l]);
            let len = length(L);
            if (len < 1e-6) { continue; }
            L = L / len;
            let pen = boxExtent(ai[0], ai[1], ai[2], hei, L) + boxExtent(aj[0], aj[1], aj[2], hej, L) - abs(dot(t, L));
            if (pen < 0.0) { return out; }
            if (pen < minPen - 1e-3) { minPen = pen; axis = L; }
        }
    }
    if (dot(t, axis) < 0.0) { axis = -axis; }  // axis points i→j
    let n = -axis;                             // n points j→i (i's separation dir)
    // Representative contact: midpoint of the two support surfaces along n.
    let si = xi - n * boxExtent(ai[0], ai[1], ai[2], hei, n);
    let sj = xj + n * boxExtent(aj[0], aj[1], aj[2], hej, n);
    out.n = n;
    out.point = 0.5 * (si + sj);
    out.hit = true;
    return out;
}

// One representative contact (normal j→i + point) for any shape pair, if overlapping.
fn pairContact(i: u32, j: u32) -> Contact {
    var out: Contact;
    out.hit = false;
    let xi = posOf(i); let shi = shapeOf(i); let hei = halfExtentOf(i);
    let xj = posOf(j); let shj = shapeOf(j); let hej = halfExtentOf(j);

    if (shi == SHAPE_SPHERE && shj == SHAPE_SPHERE) {
        let sep = xi - xj; let dist = length(sep);
        if (dist < (hei.x + hej.x) && dist > 1e-6) {
            out.n = sep / dist; out.point = xj + out.n * hej.x; out.hit = true;
        }
    } else if (shi == SHAPE_SPHERE && shj == SHAPE_BOX) {
        let cp = closestOnBox(xi, xj, quatOf(j), hej);
        let d = xi - cp; let dist = length(d);
        if (dist < hei.x && dist > 1e-6) { out.n = d / dist; out.point = cp; out.hit = true; }
    } else if (shi == SHAPE_BOX && shj == SHAPE_SPHERE) {
        let cp = closestOnBox(xj, xi, quatOf(i), hei);
        let d = cp - xj; let dist = length(d);
        if (dist < hej.x && dist > 1e-6) { out.n = d / dist; out.point = cp; out.hit = true; }
    } else {
        out = boxBoxContact(xi, quatOf(i), hei, xj, quatOf(j), hej);
    }
    return out;
}

// Accumulate body i's share of the velocity correction at a contact: normal
// restitution (bounce, gated by vnPre) + tangential friction (dissipation). The
// other body is passed in full; for the static world pass invMOther=0 / xOther=
// point (so its lever arm and generalized mass vanish). vnPre = pre-solve normal
// relative velocity. Friction here removes a μ-fraction of tangential relative
// velocity per substep — a stable approximation of the Coulomb cone.
fn applyContactVel(
    xi: vec3f, qi: vec4f, vi: vec3f, wi: vec3f, invMi: f32, invIli: vec3f,
    point: vec3f, n: vec3f,
    xOther: vec3f, qOther: vec4f, vOther: vec3f, wOther: vec3f, invMOther: f32, invIlOther: vec3f,
    vnPre: f32, e: f32, mu: f32,
    dv: ptr<function, vec3f>, dw: ptr<function, vec3f>,
) {
    let ri = point - xi;
    let ro = point - xOther;
    let vrel = (vi + cross(wi, ri)) - (vOther + cross(wOther, ro));
    let vn = dot(vrel, n);

    // Normal restitution — only on genuine impacts (above the rest threshold).
    let goalVn = select(0.0, max(-e * vnPre, 0.0), vnPre < -REST_THRESHOLD);
    let dvn = goalVn - vn;
    let rni = cross(ri, n);
    let rno = cross(ro, n);
    let wn = invMi + dot(rni, applyInvInertia(qi, invIli, rni)) + invMOther + dot(rno, applyInvInertia(qOther, invIlOther, rno));
    if (dvn > 0.0 && wn > 0.0) {
        let p = (dvn / wn) * n;
        *dv = *dv + invMi * p;
        *dw = *dw + applyInvInertia(qi, invIli, cross(ri, p));
    }

    // Tangential friction — oppose the tangential relative velocity, μ-scaled.
    let vt = vrel - vn * n;
    let vtLen = length(vt);
    if (vtLen > 1e-6 && mu > 0.0) {
        let t = vt / vtLen;
        let rti = cross(ri, t);
        let rto = cross(ro, t);
        let wt = invMi + dot(rti, applyInvInertia(qi, invIli, rti)) + invMOther + dot(rto, applyInvInertia(qOther, invIlOther, rto));
        if (wt > 0.0) {
            let p = (-(mu * vtLen) / wt) * t;
            *dv = *dv + invMi * p;
            *dw = *dw + applyInvInertia(qi, invIli, cross(ri, p));
        }
    }
}

@compute @workgroup_size(64)
fn velocitySolve(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= V.bodyCount) { return; }
    let invMi = invMassOf(i);
    if (invMi <= 0.0) { return; }
    let xi = posOf(i);
    let qi = quatOf(i);
    let vi = velOf(i);
    let wi = angOf(i);
    let invIli = invInertiaOf(i);
    let bri = boundOf(i);
    let ei = restitutionOf(i);
    let viStart = velStartOf(i);
    let wiStart = angStartOf(i);

    var dv = vec3f(0.0);
    var dw = vec3f(0.0);
    var cnt = 0.0;

    if (V.bodyCount >= 2u) {
        let qmin = xi - vec3f(bri);
        let qmax = xi + vec3f(bri);
        let leafBase = V.bodyCount - 1u;
        var stack: array<u32, 64>;
        var sp = 1;
        stack[0] = 0u;
        loop {
            if (sp <= 0) { break; }
            sp = sp - 1;
            let node = stack[sp];
            if (any(qmax < bvhNodes[node * 2u].xyz) || any(qmin > bvhNodes[node * 2u + 1u].xyz)) { continue; }
            if (node >= leafBase) {
                let j = bvhLeaves[node - leafBase];
                if (j == i) { continue; }
                let c = pairContact(i, j);
                if (c.hit) {
                    let xj = posOf(j);
                    let rj = c.point - xj;
                    let vnPre = dot((viStart + cross(wiStart, c.point - xi)) - (velStartOf(j) + cross(angStartOf(j), rj)), c.n);
                    let e = sqrt(ei * restitutionOf(j));
                    let mu = sqrt(frictionOf(i) * frictionOf(j));
                    applyContactVel(xi, qi, vi, wi, invMi, invIli, c.point, c.n,
                        xj, quatOf(j), velOf(j), angOf(j), invMassOf(j), invInertiaOf(j),
                        vnPre, e, mu, &dv, &dw);
                    cnt = cnt + 1.0;
                }
            } else if (sp <= 62) {
                stack[sp] = bitcast<u32>(bvhNodes[node * 2u].w);
                stack[sp + 1] = bitcast<u32>(bvhNodes[node * 2u + 1u].w);
                sp = sp + 2;
            }
        }
    }

    // Static world: floor + 4 bin walls (immovable, wOther = 0, world restitution).
    let h = V.binExtent;
    var normals = array<vec3f, 5>(
        vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), vec3f(-1.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, -1.0),
    );
    var offsets = array<f32, 5>(V.floorY, -h, -h, -h, -h);
    let shape = shapeOf(i);
    let hei = halfExtentOf(i);
    let eWorld = sqrt(ei * V.worldRestitution);
    let muWorld = sqrt(frictionOf(i) * V.worldFriction);
    for (var k = 0u; k < 5u; k = k + 1u) {
        let n = normals[k];
        // contact if the body's support point along -n is past the plane
        let support = boxExtent(qRot(qi, vec3f(1,0,0)), qRot(qi, vec3f(0,1,0)), qRot(qi, vec3f(0,0,1)), hei, n);
        let reach = select(support, hei.x, shape == SHAPE_SPHERE);
        let pen = offsets[k] - (dot(xi, n) - reach);
        if (pen > 0.0) {
            let point = xi - n * reach;
            let vnPre = dot(viStart + cross(wiStart, point - xi), n);
            // static world: immovable other (xOther=point ⇒ no lever arm, invM=0).
            applyContactVel(xi, qi, vi, wi, invMi, invIli, point, n,
                point, vec4f(0.0, 0.0, 0.0, 1.0), vec3f(0.0), vec3f(0.0), 0.0, vec3f(0.0),
                vnPre, eWorld, muWorld, &dv, &dw);
            cnt = cnt + 1.0;
        }
    }

    // Average this body's simultaneous velocity corrections (under-relaxation):
    // summing per-contact impulses overshoots in a dense pack and injects energy.
    if (cnt > 0.0) {
        let inv = 1.0 / cnt;
        dv = dv * inv;
        dw = dw * inv;
    }
    var v = vi + dv;
    var w = wi + dw;
    // Sleep near-rest bodies — final word each substep so dense packs settle.
    if (length(v) < SLEEP_LINEAR && length(w) < SLEEP_ANGULAR) {
        v = vec3f(0.0);
        w = vec3f(0.0);
    }
    props[i * 4u]      = vec4f(v, invMi);
    props[i * 4u + 1u] = vec4f(w, 0.0);
}
`;
