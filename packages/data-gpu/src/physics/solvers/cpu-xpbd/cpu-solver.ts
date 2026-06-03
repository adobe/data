// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Pure-TS sequential XPBD rigid-body solver, operating on flat structure-of-
 * arrays (cache-friendly, allocation-free hot loop, and the natural substrate
 * for a future zero-copy AssemblyScript port). The plugin gathers ECS columns
 * into a `SolverState`, calls `step`, and scatters dynamic bodies back.
 *
 * The win over the GPU build: contacts are solved **sequentially (Gauss-Seidel)**
 * — each correction is applied immediately so later contacts see it — which
 * converges far better than GPU Jacobi, so stacks settle cleanly with no churn.
 *
 * Per frame: broadphase (uniform spatial hash) → candidate pairs. Then N
 * substeps of: integrate (predict) → K position iterations (push apart at
 * contacts, mass+inertia weighted, XPBD compliance) → finalize (velocity from
 * pose delta) → one velocity pass (restitution above a threshold + friction) →
 * sleep. Static bodies have inverse mass 0 (immovable colliders); only dynamic
 * bodies integrate and are written back.
 */

export const SHAPE_SPHERE = 0;
export const SHAPE_BOX = 1;

export interface SolverConfig {
    gravity: number;
    substeps: number;
    iterations: number;       // position iterations per substep
    restitutionThreshold: number;
    sleepLinear: number;
    sleepAngular: number;
    /** Seconds a body must stay below the sleep thresholds before it sleeps
     *  (skipped by integrate/solve/broadphase until a moving body contacts it). */
    sleepTime: number;
    /** Rolling + spinning friction: per-substep fraction of relative angular
     *  velocity dissipated at a contact, scaled by μ. 0 disables (bodies spin
     *  forever in place — a single contact point can't oppose spin about itself). */
    rollingFriction: number;
    /** Position-solve under-relaxation (0..1). Over-constrained contacts (a body
     *  wedged among several) over-shoot if each contact applies its full
     *  correction in one pass; ω<1 with a few `iterations` converges to the
     *  consistent rest position without the overshoot that `v=Δx/h` would launch. */
    relaxation: number;
}

/** Flat SoA body state. Index i: pos[3i], orient[4i] (xyzw), vel[3i], etc. */
export interface SolverState {
    count: number;
    dynamic: Uint8Array;        // 1 = integrated + written back
    pos: Float32Array;          // 3N
    orient: Float32Array;       // 4N (xyzw)
    vel: Float32Array;          // 3N
    angVel: Float32Array;       // 3N
    invMass: Float32Array;      // N  (0 = static)
    invInertia: Float32Array;   // 3N (body-local diagonal; 0 = static)
    shape: Uint8Array;          // N
    halfExtent: Float32Array;   // 3N
    restitution: Float32Array;  // N
    friction: Float32Array;     // N
    compliance: Float32Array;   // N (contact softness, m/N; 0 = rigid)
    sleeping: Uint8Array;       // N (1 = asleep, skipped)
    sleepTimer: Float32Array;   // N (seconds continuously below the sleep threshold)
    // scratch (capacity N), reused across frames
    prevPos: Float32Array;      // 3N
    prevOrient: Float32Array;   // 4N
    velStart: Float32Array;     // 3N (approach velocity for restitution)
    angVelStart: Float32Array;  // 3N
}

export function createSolverState(capacity: number): SolverState {
    return {
        count: 0,
        dynamic: new Uint8Array(capacity),
        pos: new Float32Array(capacity * 3),
        orient: new Float32Array(capacity * 4),
        vel: new Float32Array(capacity * 3),
        angVel: new Float32Array(capacity * 3),
        invMass: new Float32Array(capacity),
        invInertia: new Float32Array(capacity * 3),
        shape: new Uint8Array(capacity),
        halfExtent: new Float32Array(capacity * 3),
        restitution: new Float32Array(capacity),
        friction: new Float32Array(capacity),
        compliance: new Float32Array(capacity),
        sleeping: new Uint8Array(capacity),
        sleepTimer: new Float32Array(capacity),
        prevPos: new Float32Array(capacity * 3),
        prevOrient: new Float32Array(capacity * 4),
        velStart: new Float32Array(capacity * 3),
        angVelStart: new Float32Array(capacity * 3),
    };
}

// --- scalar quaternion / vector helpers (out-param, no allocation) -----------
const _v = new Float32Array(3);
const _w = new Float32Array(3);

/** Rotate vector (vx,vy,vz) by quaternion (qx,qy,qz,qw) into out[0..2]. */
function qRot(out: Float32Array, qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number): void {
    // t = 2 * cross(q.xyz, v);  out = v + qw*t + cross(q.xyz, t)
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    out[0] = vx + qw * tx + (qy * tz - qz * ty);
    out[1] = vy + qw * ty + (qz * tx - qx * tz);
    out[2] = vz + qw * tz + (qx * ty - qy * tx);
}

/** World inverse inertia (diag invI in body frame, orientation q) applied to u → out. */
function applyInvInertia(out: Float32Array, ox: number, oy: number, oz: number, ow: number, ix: number, iy: number, iz: number, ux: number, uy: number, uz: number): void {
    // R^T u  (rotate by conjugate)
    qRot(_w, -ox, -oy, -oz, ow, ux, uy, uz);
    // scale by diag
    const sx = _w[0] * ix, sy = _w[1] * iy, sz = _w[2] * iz;
    // R (...)
    qRot(out, ox, oy, oz, ow, sx, sy, sz);
}

// --- broadphase: uniform spatial hash → candidate pairs ----------------------
let pairA = new Int32Array(4096);
let pairB = new Int32Array(4096);
let pairCount = 0;

function addPair(a: number, b: number): void {
    if (pairCount >= pairA.length) {
        const na = new Int32Array(pairA.length * 2);
        const nb = new Int32Array(pairB.length * 2);
        na.set(pairA); nb.set(pairB);
        pairA = na; pairB = nb;
    }
    pairA[pairCount] = a;
    pairB[pairCount] = b;
    pairCount++;
}

const cellMap = new Map<number, number[]>();
const seenPairs = new Set<number>();

function broadphase(s: SolverState, cell: number): void {
    pairCount = 0;
    cellMap.clear();
    seenPairs.clear();
    const inv = 1 / cell;
    // Insert each body's AABB-overlapped cells; collect candidate pairs.
    // Only dynamic bodies act as query origins, so static-static is never tested.
    for (let i = 0; i < s.count; i++) {
        const px = s.pos[i * 3], py = s.pos[i * 3 + 1], pz = s.pos[i * 3 + 2];
        const r = boundingRadius(s, i);
        const x0 = Math.floor((px - r) * inv), x1 = Math.floor((px + r) * inv);
        const y0 = Math.floor((py - r) * inv), y1 = Math.floor((py + r) * inv);
        const z0 = Math.floor((pz - r) * inv), z1 = Math.floor((pz + r) * inv);
        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
                for (let z = z0; z <= z1; z++) {
                    const key = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
                    let bucket = cellMap.get(key);
                    if (!bucket) { bucket = []; cellMap.set(key, bucket); }
                    // pair this body with others already in the cell
                    for (let k = 0; k < bucket.length; k++) {
                        const j = bucket[k];
                        if (s.dynamic[i] === 0 && s.dynamic[j] === 0) continue; // static-static
                        // NB: both-asleep pairs are still generated (kept cheap) so islands
                        // stay connected and a woken island has its internal contacts ready
                        // the same frame — only their *solve* is skipped (see the step loops).
                        // dedup: a pair co-occurs in several cells when bodies span them.
                        const key = i < j ? i * 1000003 + j : j * 1000003 + i;
                        if (seenPairs.has(key)) continue;
                        seenPairs.add(key);
                        addPair(i, j);
                    }
                    bucket.push(i);
                }
            }
        }
    }
}

function boundingRadius(s: SolverState, i: number): number {
    if (s.shape[i] === SHAPE_SPHERE) return s.halfExtent[i * 3];
    const hx = s.halfExtent[i * 3], hy = s.halfExtent[i * 3 + 1], hz = s.halfExtent[i * 3 + 2];
    return Math.sqrt(hx * hx + hy * hy + hz * hz);
}

// --- narrowphase: a contact manifold per pair --------------------------------
// Normals point b→a (a's separation direction). Spheres/sphere-box yield 1
// contact; box-box yields up to 4 (incident-face vertices) so stacks resist
// tipping. `_contact` is the "current" contact the position/velocity solves
// read — setContact(ci) loads it from the manifold.
const MAX_MANIFOLD = 4;
const _mN = new Float32Array(MAX_MANIFOLD * 3);
const _mP = new Float32Array(MAX_MANIFOLD * 3);
const _mD = new Float32Array(MAX_MANIFOLD);
let _mCount = 0;
const _contact = { nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0, depth: 0 };

function pushContact(nx: number, ny: number, nz: number, px: number, py: number, pz: number, depth: number): void {
    if (_mCount >= MAX_MANIFOLD || depth <= 0) return;
    const i = _mCount;
    _mN[i * 3] = nx; _mN[i * 3 + 1] = ny; _mN[i * 3 + 2] = nz;
    _mP[i * 3] = px; _mP[i * 3 + 1] = py; _mP[i * 3 + 2] = pz;
    _mD[i] = depth;
    _mCount++;
}

function setContact(ci: number): void {
    _contact.nx = _mN[ci * 3]; _contact.ny = _mN[ci * 3 + 1]; _contact.nz = _mN[ci * 3 + 2];
    _contact.px = _mP[ci * 3]; _contact.py = _mP[ci * 3 + 1]; _contact.pz = _mP[ci * 3 + 2];
    _contact.depth = _mD[ci];
}

function narrowphase(s: SolverState, a: number, b: number): void {
    _mCount = 0;
    const sa = s.shape[a], sb = s.shape[b];
    if (sa === SHAPE_SPHERE && sb === SHAPE_SPHERE) sphereSphere(s, a, b);
    else if (sa === SHAPE_SPHERE && sb === SHAPE_BOX) sphereBox(s, a, b, false);
    else if (sa === SHAPE_BOX && sb === SHAPE_SPHERE) sphereBox(s, b, a, true);
    else boxBox(s, a, b);
}

function sphereSphere(s: SolverState, a: number, b: number): void {
    const dx = s.pos[a * 3] - s.pos[b * 3];
    const dy = s.pos[a * 3 + 1] - s.pos[b * 3 + 1];
    const dz = s.pos[a * 3 + 2] - s.pos[b * 3 + 2];
    const ra = s.halfExtent[a * 3], rb = s.halfExtent[b * 3];
    const d2 = dx * dx + dy * dy + dz * dz;
    const rr = ra + rb;
    if (d2 >= rr * rr || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d, nz = dz / d;
    pushContact(nx, ny, nz, s.pos[b * 3] + nx * rb, s.pos[b * 3 + 1] + ny * rb, s.pos[b * 3 + 2] + nz * rb, rr - d);
}

// sphere `sp` vs box `bx`; flip=true means the box is body `a` (normal points b→a = toward box).
function sphereBox(s: SolverState, sp: number, bx: number, flip: boolean): void {
    const cx = s.pos[sp * 3], cy = s.pos[sp * 3 + 1], cz = s.pos[sp * 3 + 2];
    const bxp = s.pos[bx * 3], byp = s.pos[bx * 3 + 1], bzp = s.pos[bx * 3 + 2];
    const ox = s.orient[bx * 4], oy = s.orient[bx * 4 + 1], oz = s.orient[bx * 4 + 2], ow = s.orient[bx * 4 + 3];
    const hx = s.halfExtent[bx * 3], hy = s.halfExtent[bx * 3 + 1], hz = s.halfExtent[bx * 3 + 2];
    // sphere center in box-local space
    qRot(_v, -ox, -oy, -oz, ow, cx - bxp, cy - byp, cz - bzp);
    const lx = Math.max(-hx, Math.min(hx, _v[0]));
    const ly = Math.max(-hy, Math.min(hy, _v[1]));
    const lz = Math.max(-hz, Math.min(hz, _v[2]));
    qRot(_v, ox, oy, oz, ow, lx, ly, lz); // closest point, world (relative to box)
    const wx = bxp + _v[0], wy = byp + _v[1], wz = bzp + _v[2];
    let dx = cx - wx, dy = cy - wy, dz = cz - wz;
    const d2 = dx * dx + dy * dy + dz * dz;
    const r = s.halfExtent[sp * 3];
    if (d2 >= r * r || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    dx /= d; dy /= d; dz /= d; // from box surface toward sphere
    // normal must point b→a (toward body a). If box is a (flip), normal toward box = -(toward sphere).
    const sgn = flip ? -1 : 1;
    pushContact(dx * sgn, dy * sgn, dz * sgn, wx, wy, wz, r - d);
}

// box-box via SAT: min-penetration axis (normal) + a representative point.
const _ai = new Float32Array(9); // box a axes (columns)
const _bi = new Float32Array(9);

function boxAxes(out: Float32Array, s: SolverState, i: number): void {
    const ox = s.orient[i * 4], oy = s.orient[i * 4 + 1], oz = s.orient[i * 4 + 2], ow = s.orient[i * 4 + 3];
    qRot(_v, ox, oy, oz, ow, 1, 0, 0); out[0] = _v[0]; out[1] = _v[1]; out[2] = _v[2];
    qRot(_v, ox, oy, oz, ow, 0, 1, 0); out[3] = _v[0]; out[4] = _v[1]; out[5] = _v[2];
    qRot(_v, ox, oy, oz, ow, 0, 0, 1); out[6] = _v[0]; out[7] = _v[1]; out[8] = _v[2];
}

function extentAlong(axes: Float32Array, he: number, he1: number, he2: number, lx: number, ly: number, lz: number): number {
    return he * Math.abs(axes[0] * lx + axes[1] * ly + axes[2] * lz)
        + he1 * Math.abs(axes[3] * lx + axes[4] * ly + axes[5] * lz)
        + he2 * Math.abs(axes[6] * lx + axes[7] * ly + axes[8] * lz);
}

const _ha = new Float32Array(3);
const _hb = new Float32Array(3);

function boxBox(s: SolverState, a: number, b: number): void {
    boxAxes(_ai, s, a);
    boxAxes(_bi, s, b);
    _ha[0] = s.halfExtent[a * 3]; _ha[1] = s.halfExtent[a * 3 + 1]; _ha[2] = s.halfExtent[a * 3 + 2];
    _hb[0] = s.halfExtent[b * 3]; _hb[1] = s.halfExtent[b * 3 + 1]; _hb[2] = s.halfExtent[b * 3 + 2];
    const ax_ = s.pos[a * 3], ay_ = s.pos[a * 3 + 1], az_ = s.pos[a * 3 + 2];
    const bx_ = s.pos[b * 3], by_ = s.pos[b * 3 + 1], bz_ = s.pos[b * 3 + 2];
    const tx = bx_ - ax_, ty = by_ - ay_, tz = bz_ - az_;
    let minPen = Infinity, axx = 0, axy = 0, axz = 1, bestAxis = 0;
    const cand: number[] = _satAxes;
    let n = 0;
    for (let k = 0; k < 3; k++) { cand[n++] = _ai[k * 3]; cand[n++] = _ai[k * 3 + 1]; cand[n++] = _ai[k * 3 + 2]; }
    for (let k = 0; k < 3; k++) { cand[n++] = _bi[k * 3]; cand[n++] = _bi[k * 3 + 1]; cand[n++] = _bi[k * 3 + 2]; }
    for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) {
        const ux = _ai[k * 3], uy = _ai[k * 3 + 1], uz = _ai[k * 3 + 2];
        const vx = _bi[l * 3], vy = _bi[l * 3 + 1], vz = _bi[l * 3 + 2];
        cand[n++] = uy * vz - uz * vy; cand[n++] = uz * vx - ux * vz; cand[n++] = ux * vy - uy * vx;
    }
    for (let c = 0; c < n; c += 3) {
        let lx = cand[c], ly = cand[c + 1], lz = cand[c + 2];
        const len2 = lx * lx + ly * ly + lz * lz;
        if (len2 < 1e-8) continue;
        const inv = 1 / Math.sqrt(len2);
        lx *= inv; ly *= inv; lz *= inv;
        const ea = extentAlong(_ai, _ha[0], _ha[1], _ha[2], lx, ly, lz);
        const eb = extentAlong(_bi, _hb[0], _hb[1], _hb[2], lx, ly, lz);
        const pen = ea + eb - Math.abs(tx * lx + ty * ly + tz * lz);
        if (pen < 0) return; // separating axis
        if (pen < minPen - 1e-4) { minPen = pen; axx = lx; axy = ly; axz = lz; bestAxis = (c / 3) | 0; }
    }
    if (tx * axx + ty * axy + tz * axz < 0) { axx = -axx; axy = -axy; axz = -axz; } // axis → a→b
    const nx = -axx, ny = -axy, nz = -axz; // contact normal b→a (a's separation)

    if (bestAxis >= 6) { // edge-edge: one representative contact
        const ea = extentAlong(_ai, _ha[0], _ha[1], _ha[2], nx, ny, nz);
        const eb = extentAlong(_bi, _hb[0], _hb[1], _hb[2], nx, ny, nz);
        pushContact(nx, ny, nz,
            0.5 * ((ax_ - nx * ea) + (bx_ + nx * eb)), 0.5 * ((ay_ - ny * ea) + (by_ + ny * eb)), 0.5 * ((az_ - nz * ea) + (bz_ + nz * eb)),
            minPen);
        return;
    }
    // face contact: clip the incident face against the reference face's lateral
    // bounds (Sutherland–Hodgman), then keep the penetrating points. The
    // reference owns the winning SAT axis. The lateral clip is what makes
    // extreme size ratios safe: without it a small box on the big floor (or the
    // big floor as the incident face) emits contacts at the larger face's far
    // corners with large depths, violently ejecting the body.
    const refIsA = bestAxis < 3;
    const refIdx = refIsA ? bestAxis : bestAxis - 3;
    const refN0 = refIsA ? axx : nx, refN1 = refIsA ? axy : ny, refN2 = refIsA ? axz : nz; // ref outward → inc
    const refAx = refIsA ? _ai : _bi, incAx = refIsA ? _bi : _ai;
    const refHe = refIsA ? _ha : _hb, incHe = refIsA ? _hb : _ha;
    const rcx = refIsA ? ax_ : bx_, rcy = refIsA ? ay_ : by_, rcz = refIsA ? az_ : bz_;
    const icx = refIsA ? bx_ : ax_, icy = refIsA ? by_ : ay_, icz = refIsA ? bz_ : az_;
    // incident face = inc face most anti-parallel to refN
    let m = 0, best = Math.abs(incAx[0] * refN0 + incAx[1] * refN1 + incAx[2] * refN2);
    const d1 = Math.abs(incAx[3] * refN0 + incAx[4] * refN1 + incAx[5] * refN2);
    const d2 = Math.abs(incAx[6] * refN0 + incAx[7] * refN1 + incAx[8] * refN2);
    if (d1 > best) { best = d1; m = 1; }
    if (d2 > best) { best = d2; m = 2; }
    const dotM = incAx[m * 3] * refN0 + incAx[m * 3 + 1] * refN1 + incAx[m * 3 + 2] * refN2;
    const sgn = dotM > 0 ? -1 : 1;
    const m1 = (m + 1) % 3, m2 = (m + 2) % 3;
    const fcx = icx + sgn * incHe[m] * incAx[m * 3], fcy = icy + sgn * incHe[m] * incAx[m * 3 + 1], fcz = icz + sgn * incHe[m] * incAx[m * 3 + 2];
    const ux = incHe[m1] * incAx[m1 * 3], uy = incHe[m1] * incAx[m1 * 3 + 1], uz = incHe[m1] * incAx[m1 * 3 + 2];
    const vx = incHe[m2] * incAx[m2 * 3], vy = incHe[m2] * incAx[m2 * 3 + 1], vz = incHe[m2] * incAx[m2 * 3 + 2];
    // incident face's 4 corners, ring order (CCW in u,v), world space
    _poly[0] = fcx - ux - vx; _poly[1] = fcy - uy - vy; _poly[2] = fcz - uz - vz;
    _poly[3] = fcx + ux - vx; _poly[4] = fcy + uy - vy; _poly[5] = fcz + uz - vz;
    _poly[6] = fcx + ux + vx; _poly[7] = fcy + uy + vy; _poly[8] = fcz + uz + vz;
    _poly[9] = fcx - ux + vx; _poly[10] = fcy - uy + vy; _poly[11] = fcz - uz + vz;
    // clip against the reference face's four side planes (tangent axes r1, r2,
    // measured from the reference body centre — the face is offset only along refN).
    const r1 = (refIdx + 1) % 3, r2 = (refIdx + 2) % 3;
    const t1x = refAx[r1 * 3], t1y = refAx[r1 * 3 + 1], t1z = refAx[r1 * 3 + 2];
    const t2x = refAx[r2 * 3], t2y = refAx[r2 * 3 + 1], t2z = refAx[r2 * 3 + 2];
    let cnt = clipHalfSpace(_poly, 4, _poly2, t1x, t1y, t1z, rcx, rcy, rcz, refHe[r1], 1);
    cnt = clipHalfSpace(_poly2, cnt, _poly, t1x, t1y, t1z, rcx, rcy, rcz, refHe[r1], -1);
    cnt = clipHalfSpace(_poly, cnt, _poly2, t2x, t2y, t2z, rcx, rcy, rcz, refHe[r2], 1);
    cnt = clipHalfSpace(_poly2, cnt, _poly, t2x, t2y, t2z, rcx, rcy, rcz, refHe[r2], -1);
    const refHeN = refHe[refIdx];
    for (let k = 0; k < cnt; k++) {
        const px = _poly[k * 3], py = _poly[k * 3 + 1], pz = _poly[k * 3 + 2];
        const depth = refHeN - ((px - rcx) * refN0 + (py - rcy) * refN1 + (pz - rcz) * refN2);
        pushContact(nx, ny, nz, px, py, pz, depth);
    }
}
const _satAxes: number[] = new Array(45);
// Clip ring-ordered polygon `inp` (count verts, xyz triples) by the half-space
// { s·dot(p − C, T) ≤ bound } into `out`; returns the new vertex count. A convex
// polygon clipped by a plane gains at most one vertex, so a quad through four
// planes stays ≤ 8 — the buffers below. Allocation-free (Sutherland–Hodgman).
const _poly = new Float32Array(8 * 3);
const _poly2 = new Float32Array(8 * 3);
function clipHalfSpace(inp: Float32Array, count: number, out: Float32Array, Tx: number, Ty: number, Tz: number, Cx: number, Cy: number, Cz: number, bound: number, s: number): number {
    let oc = 0;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const pix = inp[i * 3], piy = inp[i * 3 + 1], piz = inp[i * 3 + 2];
        const pjx = inp[j * 3], pjy = inp[j * 3 + 1], pjz = inp[j * 3 + 2];
        const di = s * ((pix - Cx) * Tx + (piy - Cy) * Ty + (piz - Cz) * Tz) - bound; // ≤0 inside
        const dj = s * ((pjx - Cx) * Tx + (pjy - Cy) * Ty + (pjz - Cz) * Tz) - bound;
        if (di <= 0) { out[oc * 3] = pix; out[oc * 3 + 1] = piy; out[oc * 3 + 2] = piz; oc++; }
        if ((di <= 0) !== (dj <= 0)) {
            const t = di / (di - dj);
            out[oc * 3] = pix + t * (pjx - pix); out[oc * 3 + 1] = piy + t * (pjy - piy); out[oc * 3 + 2] = piz + t * (pjz - piz); oc++;
        }
    }
    return oc;
}

// --- position constraint (Gauss-Seidel: mutate both bodies in place) ---------
const _gi = new Float32Array(3);
const _gj = new Float32Array(3);
const _drA = new Float32Array(3);
const _drB = new Float32Array(3);
const _loc = new Float32Array(3);
const _wld = new Float32Array(3);

// Effective inverse mass/inertia: a sleeping body is immovable (0), so awake
// bodies rest on it like a static collider until a moving body wakes it.
function imOf(s: SolverState, i: number): number { return s.sleeping[i] === 1 ? 0 : s.invMass[i]; }

/** Generalized inverse mass of the pair along unit dir at arms ra, rb. */
function genW(s: SolverState, a: number, b: number, rax: number, ray: number, raz: number, rbx: number, rby: number, rbz: number, dx: number, dy: number, dz: number): number {
    const ranx = ray * dz - raz * dy, rany = raz * dx - rax * dz, ranz = rax * dy - ray * dx;
    const rbnx = rby * dz - rbz * dy, rbny = rbz * dx - rbx * dz, rbnz = rbx * dy - rby * dx;
    const sa = s.sleeping[a] === 1 ? 0 : 1, sb = s.sleeping[b] === 1 ? 0 : 1;
    applyInvInertia(_gi, s.orient[a * 4], s.orient[a * 4 + 1], s.orient[a * 4 + 2], s.orient[a * 4 + 3], sa * s.invInertia[a * 3], sa * s.invInertia[a * 3 + 1], sa * s.invInertia[a * 3 + 2], ranx, rany, ranz);
    applyInvInertia(_gj, s.orient[b * 4], s.orient[b * 4 + 1], s.orient[b * 4 + 2], s.orient[b * 4 + 3], sb * s.invInertia[b * 3], sb * s.invInertia[b * 3 + 1], sb * s.invInertia[b * 3 + 2], rbnx, rbny, rbnz);
    return imOf(s, a) + ranx * _gi[0] + rany * _gi[1] + ranz * _gi[2] + imOf(s, b) + rbnx * _gj[0] + rbny * _gj[1] + rbnz * _gj[2];
}

/** Apply a positional impulse `lambda` along dir: body a moves +, body b moves −. */
function applyPosCorr(s: SolverState, a: number, b: number, rax: number, ray: number, raz: number, rbx: number, rby: number, rbz: number, dx: number, dy: number, dz: number, lambda: number): void {
    const imA = imOf(s, a), imB = imOf(s, b);
    const px = lambda * dx, py = lambda * dy, pz = lambda * dz;
    if (imA > 0) {
        s.pos[a * 3] += imA * px; s.pos[a * 3 + 1] += imA * py; s.pos[a * 3 + 2] += imA * pz;
        applyInvInertia(_gi, s.orient[a * 4], s.orient[a * 4 + 1], s.orient[a * 4 + 2], s.orient[a * 4 + 3], s.invInertia[a * 3], s.invInertia[a * 3 + 1], s.invInertia[a * 3 + 2], ray * pz - raz * py, raz * px - rax * pz, rax * py - ray * px);
        integrateQuat(s.orient, a, _gi[0], _gi[1], _gi[2]);
    }
    if (imB > 0) {
        s.pos[b * 3] -= imB * px; s.pos[b * 3 + 1] -= imB * py; s.pos[b * 3 + 2] -= imB * pz;
        applyInvInertia(_gj, s.orient[b * 4], s.orient[b * 4 + 1], s.orient[b * 4 + 2], s.orient[b * 4 + 3], s.invInertia[b * 3], s.invInertia[b * 3 + 1], s.invInertia[b * 3 + 2], -(rby * pz - rbz * py), -(rbz * px - rbx * pz), -(rbx * py - rby * px));
        integrateQuat(s.orient, b, _gj[0], _gj[1], _gj[2]);
    }
}

/** World displacement of body i's material point now at (Px,Py,Pz) since the
 *  substep start (predicted pose vs prevPos/prevOrient). Static body → 0. */
function contactDrift(s: SolverState, i: number, Px: number, Py: number, Pz: number, out: Float32Array): void {
    const rx = Px - s.pos[i * 3], ry = Py - s.pos[i * 3 + 1], rz = Pz - s.pos[i * 3 + 2];
    qRot(_loc, -s.orient[i * 4], -s.orient[i * 4 + 1], -s.orient[i * 4 + 2], s.orient[i * 4 + 3], rx, ry, rz);
    qRot(_wld, s.prevOrient[i * 4], s.prevOrient[i * 4 + 1], s.prevOrient[i * 4 + 2], s.prevOrient[i * 4 + 3], _loc[0], _loc[1], _loc[2]);
    out[0] = Px - (s.prevPos[i * 3] + _wld[0]);
    out[1] = Py - (s.prevPos[i * 3 + 1] + _wld[1]);
    out[2] = Pz - (s.prevPos[i * 3 + 2] + _wld[2]);
}

/**
 * XPBD contact: non-penetration (compliant via α) plus position-based Coulomb
 * friction. The friction correction removes the tangential drift the two
 * surfaces accumulated this substep, but clamped so λt ≤ μ·λn — the contact
 * sticks (static friction) until the tangential load exceeds μ× the normal
 * load, then slides (dynamic). Load-scaled, unlike a fractional velocity decay.
 */
function solvePosition(s: SolverState, a: number, b: number, mu: number, compliance: number, dt: number, relax: number): void {
    const nx = _contact.nx, ny = _contact.ny, nz = _contact.nz, depth = _contact.depth;
    const Px = _contact.px, Py = _contact.py, Pz = _contact.pz;
    const rax = Px - s.pos[a * 3], ray = Py - s.pos[a * 3 + 1], raz = Pz - s.pos[a * 3 + 2];
    const rbx = Px - s.pos[b * 3], rby = Py - s.pos[b * 3 + 1], rbz = Pz - s.pos[b * 3 + 2];

    // Measure the tangential drift *before* this contact's normal correction —
    // otherwise the rotation that correction induces shows up as drift and the
    // friction term "opposes" it, injecting energy (the dense-stack explosions).
    let tx = 0, ty = 0, tz = 0, tl = 0;
    if (mu > 0) {
        contactDrift(s, a, Px, Py, Pz, _drA);
        contactDrift(s, b, Px, Py, Pz, _drB);
        tx = _drA[0] - _drB[0]; ty = _drA[1] - _drB[1]; tz = _drA[2] - _drB[2];
        const tn = tx * nx + ty * ny + tz * nz;
        tx -= tn * nx; ty -= tn * ny; tz -= tn * nz;
        tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    }

    const wsN = genW(s, a, b, rax, ray, raz, rbx, rby, rbz, nx, ny, nz) + compliance / (dt * dt);
    if (wsN <= 0) return;
    const lambdaN = relax * depth / wsN;
    applyPosCorr(s, a, b, rax, ray, raz, rbx, rby, rbz, nx, ny, nz, lambdaN);
    if (mu <= 0 || lambdaN <= 0 || tl < 1e-9) return;
    tx /= tl; ty /= tl; tz /= tl;
    const wT = genW(s, a, b, rax, ray, raz, rbx, rby, rbz, tx, ty, tz);
    if (wT <= 0) return;
    let lambdaT = relax * tl / wT;
    const maxT = mu * lambdaN;
    if (lambdaT > maxT) lambdaT = maxT;          // dynamic-friction clamp
    applyPosCorr(s, a, b, rax, ray, raz, rbx, rby, rbz, tx, ty, tz, -lambdaT); // oppose drift
}

/** q += 0.5 * (w,0) * q ; normalize. (w is the rotation-vector delta.) */
function integrateQuat(orient: Float32Array, i: number, wx: number, wy: number, wz: number): void {
    const x = orient[i * 4], y = orient[i * 4 + 1], z = orient[i * 4 + 2], w = orient[i * 4 + 3];
    let nx = x + 0.5 * (wx * w + wy * z - wz * y);
    let ny = y + 0.5 * (-wx * z + wy * w + wz * x);
    let nz = z + 0.5 * (wx * y - wy * x + wz * w);
    let nw = w + 0.5 * (-wx * x - wy * y - wz * z);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    if (len < 1e-9) return;
    const inv = 1 / len;
    orient[i * 4] = nx * inv; orient[i * 4 + 1] = ny * inv; orient[i * 4 + 2] = nz * inv; orient[i * 4 + 3] = nw * inv;
}

// --- velocity constraint (restitution + friction, Gauss-Seidel) --------------
function solveVelocity(s: SolverState, a: number, b: number, e: number, threshold: number, roll: number, firstContact: boolean): void {
    const nx = _contact.nx, ny = _contact.ny, nz = _contact.nz;
    const rax = _contact.px - s.pos[a * 3], ray = _contact.py - s.pos[a * 3 + 1], raz = _contact.pz - s.pos[a * 3 + 2];
    const rbx = _contact.px - s.pos[b * 3], rby = _contact.py - s.pos[b * 3 + 1], rbz = _contact.pz - s.pos[b * 3 + 2];
    // relative velocity at contact (current)
    const vax = s.vel[a * 3] + (s.angVel[a * 3 + 1] * raz - s.angVel[a * 3 + 2] * ray);
    const vay = s.vel[a * 3 + 1] + (s.angVel[a * 3 + 2] * rax - s.angVel[a * 3] * raz);
    const vaz = s.vel[a * 3 + 2] + (s.angVel[a * 3] * ray - s.angVel[a * 3 + 1] * rax);
    const vbx = s.vel[b * 3] + (s.angVel[b * 3 + 1] * rbz - s.angVel[b * 3 + 2] * rby);
    const vby = s.vel[b * 3 + 1] + (s.angVel[b * 3 + 2] * rbx - s.angVel[b * 3] * rbz);
    const vbz = s.vel[b * 3 + 2] + (s.angVel[b * 3] * rby - s.angVel[b * 3 + 1] * rbx);
    let rvx = vax - vbx, rvy = vay - vby, rvz = vaz - vbz;
    const vn = rvx * nx + rvy * ny + rvz * nz;
    // pre-solve approach velocity for restitution
    const sax = s.velStart[a * 3] + (s.angVelStart[a * 3 + 1] * raz - s.angVelStart[a * 3 + 2] * ray);
    const say = s.velStart[a * 3 + 1] + (s.angVelStart[a * 3 + 2] * rax - s.angVelStart[a * 3] * raz);
    const saz = s.velStart[a * 3 + 2] + (s.angVelStart[a * 3] * ray - s.angVelStart[a * 3 + 1] * rax);
    const sbx = s.velStart[b * 3] + (s.angVelStart[b * 3 + 1] * rbz - s.angVelStart[b * 3 + 2] * rby);
    const sby = s.velStart[b * 3 + 1] + (s.angVelStart[b * 3 + 2] * rbx - s.angVelStart[b * 3] * rbz);
    const sbz = s.velStart[b * 3 + 2] + (s.angVelStart[b * 3] * rby - s.angVelStart[b * 3 + 1] * rbx);
    const vnPre = (sax - sbx) * nx + (say - sby) * ny + (saz - sbz) * nz;

    // Set the normal velocity to the restitution target (two-sided), rather than
    // only ever increasing it. The position solve reconstructs velocity as Δx/h,
    // which leaves a *separating* velocity behind whenever it pushes a body out
    // of penetration (gravity each substep, or a wedge squeezing a body). Only
    // ever adding (the old `dvn > 0`) let that spurious outward velocity survive
    // and accumulate — a resting/wedged body would hop and gain energy. Removing
    // the excess separation down to the restitution target (0 at rest) is the
    // Müller-2019 velocity update and is what makes resting contacts dissipative.
    const goalVn = vnPre < -threshold ? Math.max(-e * vnPre, 0) : 0;
    applyVelImpulse(s, a, b, rax, ray, raz, rbx, rby, rbz, nx, ny, nz, goalVn - vn);
    // Tangential (sliding) friction is handled in the position solve (Coulomb,
    // clamped by μ·λn); the velocity pass only does restitution + rolling/spin.

    // rolling + spinning friction: oppose the *relative angular* velocity at the
    // contact (once per pair). Only spheres need it — a sphere's single contact
    // sits on its spin axis, so neither sliding nor position friction can stop
    // it spinning/rolling. Boxes resist spin geometrically via their multi-point
    // contact patch (position-solve friction at the corners), so they're left be.
    if (firstContact && roll > 0) {
        const rwx = s.angVel[a * 3] - s.angVel[b * 3];
        const rwy = s.angVel[a * 3 + 1] - s.angVel[b * 3 + 1];
        const rwz = s.angVel[a * 3 + 2] - s.angVel[b * 3 + 2];
        if (s.shape[a] === SHAPE_SPHERE && imOf(s, a) > 0) { s.angVel[a * 3] -= rwx * roll; s.angVel[a * 3 + 1] -= rwy * roll; s.angVel[a * 3 + 2] -= rwz * roll; }
        if (s.shape[b] === SHAPE_SPHERE && imOf(s, b) > 0) { s.angVel[b * 3] += rwx * roll; s.angVel[b * 3 + 1] += rwy * roll; s.angVel[b * 3 + 2] += rwz * roll; }
    }
}

// apply a velocity impulse along (dx,dy,dz) that changes the relative velocity
// along that direction by `dRel` (split by generalized inverse mass).
function applyVelImpulse(s: SolverState, a: number, b: number, rax: number, ray: number, raz: number, rbx: number, rby: number, rbz: number, dx: number, dy: number, dz: number, dRel: number): void {
    const imA = imOf(s, a), imB = imOf(s, b);
    const sa = s.sleeping[a] === 1 ? 0 : 1, sb = s.sleeping[b] === 1 ? 0 : 1;
    const ranx = ray * dz - raz * dy, rany = raz * dx - rax * dz, ranz = rax * dy - ray * dx;
    const rbnx = rby * dz - rbz * dy, rbny = rbz * dx - rbx * dz, rbnz = rbx * dy - rby * dx;
    applyInvInertia(_gi, s.orient[a * 4], s.orient[a * 4 + 1], s.orient[a * 4 + 2], s.orient[a * 4 + 3], sa * s.invInertia[a * 3], sa * s.invInertia[a * 3 + 1], sa * s.invInertia[a * 3 + 2], ranx, rany, ranz);
    applyInvInertia(_gj, s.orient[b * 4], s.orient[b * 4 + 1], s.orient[b * 4 + 2], s.orient[b * 4 + 3], sb * s.invInertia[b * 3], sb * s.invInertia[b * 3 + 1], sb * s.invInertia[b * 3 + 2], rbnx, rbny, rbnz);
    const wA = imA + ranx * _gi[0] + rany * _gi[1] + ranz * _gi[2];
    const wB = imB + rbnx * _gj[0] + rbny * _gj[1] + rbnz * _gj[2];
    const wSum = wA + wB;
    if (wSum <= 0) return;
    const j = dRel / wSum;
    const px = j * dx, py = j * dy, pz = j * dz;
    if (imA > 0) {
        s.vel[a * 3] += imA * px; s.vel[a * 3 + 1] += imA * py; s.vel[a * 3 + 2] += imA * pz;
        s.angVel[a * 3] += _gi[0] * j; s.angVel[a * 3 + 1] += _gi[1] * j; s.angVel[a * 3 + 2] += _gi[2] * j;
    }
    if (imB > 0) {
        s.vel[b * 3] -= imB * px; s.vel[b * 3 + 1] -= imB * py; s.vel[b * 3 + 2] -= imB * pz;
        s.angVel[b * 3] -= _gj[0] * j; s.angVel[b * 3 + 1] -= _gj[1] * j; s.angVel[b * 3 + 2] -= _gj[2] * j;
    }
}

/** A body is "moving" if it exceeds the sleep thresholds — only such bodies
 *  wake their resting neighbours (a slowly-settling body must not). */
function isMoving(s: SolverState, i: number, cfg: SolverConfig): boolean {
    const v2 = s.vel[i * 3] ** 2 + s.vel[i * 3 + 1] ** 2 + s.vel[i * 3 + 2] ** 2;
    const w2 = s.angVel[i * 3] ** 2 + s.angVel[i * 3 + 1] ** 2 + s.angVel[i * 3 + 2] ** 2;
    return v2 > cfg.sleepLinear * cfg.sleepLinear || w2 > cfg.sleepAngular * cfg.sleepAngular;
}

// --- contact islands (union-find over dynamic-dynamic pairs) ------------------
// Bodies connected through contacts form an island that sleeps and wakes as a
// unit. This is what makes sleeping safe: you never get a lone awake body
// wedged among rigid sleepers (which the under-iterated solver would eject) —
// if any island member is moving, the whole island stays awake.
let _parent = new Int32Array(256);

function findRoot(x: number): number {
    while (_parent[x] !== x) { _parent[x] = _parent[_parent[x]]; x = _parent[x]; }
    return x;
}

function buildIslands(s: SolverState): void {
    if (_parent.length < s.count) _parent = new Int32Array(s.count);
    for (let i = 0; i < s.count; i++) _parent[i] = i;
    for (let p = 0; p < pairCount; p++) {
        const a = pairA[p], b = pairB[p];
        if (s.dynamic[a] === 1 && s.dynamic[b] === 1) {
            const ra = findRoot(a), rb = findRoot(b);
            if (ra !== rb) _parent[ra] = rb;
        }
    }
}

/** Wake a single body: reset its rest timer and sync prevPose to current so the
 *  finalize step (vel = Δpose/dt) doesn't read a stale, pre-sleep pose. */
function wakeOne(s: SolverState, i: number): void {
    s.sleeping[i] = 0;
    s.sleepTimer[i] = 0;
    s.prevPos[i * 3] = s.pos[i * 3]; s.prevPos[i * 3 + 1] = s.pos[i * 3 + 1]; s.prevPos[i * 3 + 2] = s.pos[i * 3 + 2];
    s.prevOrient[i * 4] = s.orient[i * 4]; s.prevOrient[i * 4 + 1] = s.orient[i * 4 + 1]; s.prevOrient[i * 4 + 2] = s.orient[i * 4 + 2]; s.prevOrient[i * 4 + 3] = s.orient[i * 4 + 3];
}

/** Wake body i and every sleeping body in its contact island. */
function wake(s: SolverState, i: number): void {
    if (s.sleeping[i] === 0) return;
    const root = findRoot(i);
    for (let j = 0; j < s.count; j++) {
        if (s.sleeping[j] === 1 && findRoot(j) === root) wakeOne(s, j);
    }
}

// --- the step ----------------------------------------------------------------
export function step(s: SolverState, dt: number, cfg: SolverConfig): void {
    if (s.count === 0) return;
    const cellSize = 3.0; // ≥ largest body diameter — fewer multi-cell spans → fewer dup pairs
    broadphase(s, cellSize);
    buildIslands(s);
    const sdt = dt / cfg.substeps;

    for (let sub = 0; sub < cfg.substeps; sub++) {
        // integrate dynamic, awake bodies
        for (let i = 0; i < s.count; i++) {
            if (s.dynamic[i] === 0 || s.sleeping[i] === 1) continue;
            s.prevPos[i * 3] = s.pos[i * 3]; s.prevPos[i * 3 + 1] = s.pos[i * 3 + 1]; s.prevPos[i * 3 + 2] = s.pos[i * 3 + 2];
            s.prevOrient[i * 4] = s.orient[i * 4]; s.prevOrient[i * 4 + 1] = s.orient[i * 4 + 1]; s.prevOrient[i * 4 + 2] = s.orient[i * 4 + 2]; s.prevOrient[i * 4 + 3] = s.orient[i * 4 + 3];
            s.vel[i * 3 + 1] -= cfg.gravity * sdt;
            s.velStart[i * 3] = s.vel[i * 3]; s.velStart[i * 3 + 1] = s.vel[i * 3 + 1]; s.velStart[i * 3 + 2] = s.vel[i * 3 + 2];
            s.angVelStart[i * 3] = s.angVel[i * 3]; s.angVelStart[i * 3 + 1] = s.angVel[i * 3 + 1]; s.angVelStart[i * 3 + 2] = s.angVel[i * 3 + 2];
            s.pos[i * 3] += s.vel[i * 3] * sdt; s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * sdt; s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * sdt;
            integrateQuat(s.orient, i, s.angVel[i * 3] * sdt, s.angVel[i * 3 + 1] * sdt, s.angVel[i * 3 + 2] * sdt);
        }

        // position iterations (Gauss-Seidel over contact pairs)
        for (let iter = 0; iter < cfg.iterations; iter++) {
            for (let p = 0; p < pairCount; p++) {
                const a = pairA[p], b = pairB[p];
                if (s.sleeping[a] === 1 && s.sleeping[b] === 1) continue;
                narrowphase(s, a, b);
                if (_mCount === 0) continue;
                // A resting body wakes only when a genuinely moving body touches
                // it (a slowly-settling neighbour mustn't, or the pile churns
                // awake forever). Until then it stays asleep and the solve treats
                // it as immovable (imOf → 0), so awake bodies rest on it like a
                // static collider — no sink-through.
                if (s.sleeping[a] === 1 && isMoving(s, b, cfg)) wake(s, a);
                if (s.sleeping[b] === 1 && isMoving(s, a, cfg)) wake(s, b);
                const mu = Math.sqrt(s.friction[a] * s.friction[b]);
                const compliance = s.compliance[a] + s.compliance[b]; // series springs
                for (let ci = 0; ci < _mCount; ci++) {
                    setContact(ci);
                    if (_contact.depth > 0) solvePosition(s, a, b, mu, compliance, sdt, cfg.relaxation);
                }
            }
        }

        // finalize: velocity from pose delta
        for (let i = 0; i < s.count; i++) {
            if (s.dynamic[i] === 0 || s.sleeping[i] === 1) continue;
            s.vel[i * 3] = (s.pos[i * 3] - s.prevPos[i * 3]) / sdt;
            s.vel[i * 3 + 1] = (s.pos[i * 3 + 1] - s.prevPos[i * 3 + 1]) / sdt;
            s.vel[i * 3 + 2] = (s.pos[i * 3 + 2] - s.prevPos[i * 3 + 2]) / sdt;
            angVelFromDelta(s, i, sdt);
        }

        // velocity pass: restitution + friction over contact pairs
        for (let p = 0; p < pairCount; p++) {
            const a = pairA[p], b = pairB[p];
            if (s.sleeping[a] === 1 && s.sleeping[b] === 1) continue;
            narrowphase(s, a, b);
            const e = Math.sqrt(s.restitution[a] * s.restitution[b]);
            const mu = Math.sqrt(s.friction[a] * s.friction[b]);
            const roll = mu * cfg.rollingFriction;
            for (let ci = 0; ci < _mCount; ci++) {
                setContact(ci);
                if (_contact.depth > 0) solveVelocity(s, a, b, e, cfg.restitutionThreshold, roll, ci === 0);
            }
        }
    }

    // Sleep per body: a body sleeps once it has stayed below the rest threshold
    // for sleepTime (a timer avoids freezing mid-settle), so a pile sleeps body
    // by body as it quiesces — robust to one jittery body, unlike an
    // island-minimum rule which a single mover would keep awake. Safety comes
    // instead from the *wake* side: `wake` rouses the whole contact island, so a
    // body is never left awake and wedged among rigid sleepers for long.
    for (let i = 0; i < s.count; i++) {
        if (s.dynamic[i] === 0 || s.sleeping[i] === 1) continue;
        const v2 = s.vel[i * 3] ** 2 + s.vel[i * 3 + 1] ** 2 + s.vel[i * 3 + 2] ** 2;
        const w2 = s.angVel[i * 3] ** 2 + s.angVel[i * 3 + 1] ** 2 + s.angVel[i * 3 + 2] ** 2;
        if (v2 < cfg.sleepLinear * cfg.sleepLinear && w2 < cfg.sleepAngular * cfg.sleepAngular) {
            s.sleepTimer[i] += dt;
            if (s.sleepTimer[i] >= cfg.sleepTime) {
                s.sleeping[i] = 1;
                s.vel[i * 3] = 0; s.vel[i * 3 + 1] = 0; s.vel[i * 3 + 2] = 0;
                s.angVel[i * 3] = 0; s.angVel[i * 3 + 1] = 0; s.angVel[i * 3 + 2] = 0;
            }
        } else {
            s.sleepTimer[i] = 0;
        }
    }
}

function angVelFromDelta(s: SolverState, i: number, sdt: number): void {
    // dq = q * conj(prevQ); w = 2 * dq.xyz / dt (shortest arc)
    const x = s.orient[i * 4], y = s.orient[i * 4 + 1], z = s.orient[i * 4 + 2], w = s.orient[i * 4 + 3];
    const px = s.prevOrient[i * 4], py = s.prevOrient[i * 4 + 1], pz = s.prevOrient[i * 4 + 2], pw = s.prevOrient[i * 4 + 3];
    // q * conj(p): conj(p) = (-px,-py,-pz,pw)
    let dqx = w * -px + x * pw + y * -pz - z * -py;
    let dqy = w * -py - x * -pz + y * pw + z * -px;
    let dqz = w * -pz + x * -py - y * -px + z * pw;
    let dqw = w * pw - x * -px - y * -py - z * -pz;
    if (dqw < 0) { dqx = -dqx; dqy = -dqy; dqz = -dqz; }
    s.angVel[i * 3] = (2 * dqx) / sdt; s.angVel[i * 3 + 1] = (2 * dqy) / sdt; s.angVel[i * 3 + 2] = (2 * dqz) / sdt;
}

// Floors, walls and scenery are ordinary StaticCollider bodies (inverse mass 0)
// gathered alongside dynamic bodies, so they collide through the same
// broadphase + narrowphase + position/velocity solve — no special-case world
// planes. The solver knows nothing about "floors"; an immovable collider is
// just a body the position/velocity corrections can't move.
