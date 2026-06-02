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
    worldRestitution: number; // floor + walls
    worldFriction: number;
    floorY: number;
    binExtent: number;        // ±x/±z walls; <=0 disables walls
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
    sleeping: Uint8Array;       // N (1 = asleep, skipped)
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
        sleeping: new Uint8Array(capacity),
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
    // face contact: reference owns the winning axis; clip incident face vertices.
    const refIsA = bestAxis < 3;
    const refIdx = refIsA ? bestAxis : bestAxis - 3;
    const refN0 = refIsA ? axx : nx, refN1 = refIsA ? axy : ny, refN2 = refIsA ? axz : nz; // ref outward → inc
    const refAx = refIsA ? _ai : _bi, incAx = refIsA ? _bi : _ai;
    const refHe = refIsA ? _ha : _hb, incHe = refIsA ? _hb : _ha;
    const rcx = refIsA ? ax_ : bx_, rcy = refIsA ? ay_ : by_, rcz = refIsA ? az_ : bz_;
    const icx = refIsA ? bx_ : ax_, icy = refIsA ? by_ : ay_, icz = refIsA ? bz_ : az_;
    void refAx;
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
    const refHeN = refHe[refIdx];
    for (let su = -1; su <= 1; su += 2) {
        for (let sv = -1; sv <= 1; sv += 2) {
            const px = fcx + su * ux + sv * vx, py = fcy + su * uy + sv * vy, pz = fcz + su * uz + sv * vz;
            const depth = refHeN - ((px - rcx) * refN0 + (py - rcy) * refN1 + (pz - rcz) * refN2);
            pushContact(nx, ny, nz, px, py, pz, depth);
        }
    }
}
const _satAxes: number[] = new Array(45);

// --- position constraint (Gauss-Seidel: mutate both bodies in place) ---------
const _gi = new Float32Array(3);
const _gj = new Float32Array(3);

function solvePosition(s: SolverState, a: number, b: number, compliance: number, dt: number): void {
    const nx = _contact.nx, ny = _contact.ny, nz = _contact.nz, depth = _contact.depth;
    const rax = _contact.px - s.pos[a * 3], ray = _contact.py - s.pos[a * 3 + 1], raz = _contact.pz - s.pos[a * 3 + 2];
    const rbx = _contact.px - s.pos[b * 3], rby = _contact.py - s.pos[b * 3 + 1], rbz = _contact.pz - s.pos[b * 3 + 2];
    const imA = s.invMass[a], imB = s.invMass[b];
    // angular generalized inverse mass: (r×n)·Iinv·(r×n)
    const ranx = ray * nz - raz * ny, rany = raz * nx - rax * nz, ranz = rax * ny - ray * nx;
    const rbnx = rby * nz - rbz * ny, rbny = rbz * nx - rbx * nz, rbnz = rbx * ny - rby * nx;
    applyInvInertia(_gi, s.orient[a * 4], s.orient[a * 4 + 1], s.orient[a * 4 + 2], s.orient[a * 4 + 3],
        s.invInertia[a * 3], s.invInertia[a * 3 + 1], s.invInertia[a * 3 + 2], ranx, rany, ranz);
    applyInvInertia(_gj, s.orient[b * 4], s.orient[b * 4 + 1], s.orient[b * 4 + 2], s.orient[b * 4 + 3],
        s.invInertia[b * 3], s.invInertia[b * 3 + 1], s.invInertia[b * 3 + 2], rbnx, rbny, rbnz);
    const wA = imA + ranx * _gi[0] + rany * _gi[1] + ranz * _gi[2];
    const wB = imB + rbnx * _gj[0] + rbny * _gj[1] + rbnz * _gj[2];
    const aTilde = compliance / (dt * dt);
    const wSum = wA + wB + aTilde;
    if (wSum <= 0) return;
    const lambda = depth / wSum; // positional impulse magnitude
    const px = lambda * nx, py = lambda * ny, pz = lambda * nz;
    // body a moves +n, body b moves -n
    if (imA > 0) {
        s.pos[a * 3] += imA * px; s.pos[a * 3 + 1] += imA * py; s.pos[a * 3 + 2] += imA * pz;
        applyInvInertia(_gi, s.orient[a * 4], s.orient[a * 4 + 1], s.orient[a * 4 + 2], s.orient[a * 4 + 3],
            s.invInertia[a * 3], s.invInertia[a * 3 + 1], s.invInertia[a * 3 + 2],
            ray * pz - raz * py, raz * px - rax * pz, rax * py - ray * px);
        integrateQuat(s.orient, a, _gi[0], _gi[1], _gi[2]);
    }
    if (imB > 0) {
        s.pos[b * 3] -= imB * px; s.pos[b * 3 + 1] -= imB * py; s.pos[b * 3 + 2] -= imB * pz;
        applyInvInertia(_gj, s.orient[b * 4], s.orient[b * 4 + 1], s.orient[b * 4 + 2], s.orient[b * 4 + 3],
            s.invInertia[b * 3], s.invInertia[b * 3 + 1], s.invInertia[b * 3 + 2],
            -(rby * pz - rbz * py), -(rbz * px - rbx * pz), -(rbx * py - rby * px));
        integrateQuat(s.orient, b, _gj[0], _gj[1], _gj[2]);
    }
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
function solveVelocity(s: SolverState, a: number, b: number, e: number, mu: number, threshold: number): void {
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

    const goalVn = vnPre < -threshold ? Math.max(-e * vnPre, 0) : 0;
    const dvn = goalVn - vn;
    if (dvn > 0) applyVelImpulse(s, a, b, rax, ray, raz, rbx, rby, rbz, nx, ny, nz, dvn);

    // friction: oppose tangential relative velocity (recompute rv after normal change is minor; reuse)
    const vtx = rvx - vn * nx, vty = rvy - vn * ny, vtz = rvz - vn * nz;
    const vtLen = Math.sqrt(vtx * vtx + vty * vty + vtz * vtz);
    if (vtLen > 1e-6 && mu > 0) {
        const tx = vtx / vtLen, ty = vty / vtLen, tz = vtz / vtLen;
        applyVelImpulse(s, a, b, rax, ray, raz, rbx, rby, rbz, tx, ty, tz, -mu * vtLen);
    }
}

// apply a velocity impulse along (dx,dy,dz) that changes the relative velocity
// along that direction by `dRel` (split by generalized inverse mass).
function applyVelImpulse(s: SolverState, a: number, b: number, rax: number, ray: number, raz: number, rbx: number, rby: number, rbz: number, dx: number, dy: number, dz: number, dRel: number): void {
    const imA = s.invMass[a], imB = s.invMass[b];
    const ranx = ray * dz - raz * dy, rany = raz * dx - rax * dz, ranz = rax * dy - ray * dx;
    const rbnx = rby * dz - rbz * dy, rbny = rbz * dx - rbx * dz, rbnz = rbx * dy - rby * dx;
    applyInvInertia(_gi, s.orient[a * 4], s.orient[a * 4 + 1], s.orient[a * 4 + 2], s.orient[a * 4 + 3], s.invInertia[a * 3], s.invInertia[a * 3 + 1], s.invInertia[a * 3 + 2], ranx, rany, ranz);
    applyInvInertia(_gj, s.orient[b * 4], s.orient[b * 4 + 1], s.orient[b * 4 + 2], s.orient[b * 4 + 3], s.invInertia[b * 3], s.invInertia[b * 3 + 1], s.invInertia[b * 3 + 2], rbnx, rbny, rbnz);
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

// --- the step ----------------------------------------------------------------
export function step(s: SolverState, dt: number, cfg: SolverConfig): void {
    if (s.count === 0) return;
    const cellSize = 3.0; // ≥ largest body diameter — fewer multi-cell spans → fewer dup pairs
    broadphase(s, cellSize);
    const sdt = dt / cfg.substeps;

    for (let sub = 0; sub < cfg.substeps; sub++) {
        // integrate dynamic, awake bodies
        for (let i = 0; i < s.count; i++) {
            if (s.dynamic[i] === 0) continue;
            s.prevPos[i * 3] = s.pos[i * 3]; s.prevPos[i * 3 + 1] = s.pos[i * 3 + 1]; s.prevPos[i * 3 + 2] = s.pos[i * 3 + 2];
            s.prevOrient[i * 4] = s.orient[i * 4]; s.prevOrient[i * 4 + 1] = s.orient[i * 4 + 1]; s.prevOrient[i * 4 + 2] = s.orient[i * 4 + 2]; s.prevOrient[i * 4 + 3] = s.orient[i * 4 + 3];
            s.vel[i * 3 + 1] -= cfg.gravity * sdt;
            s.velStart[i * 3] = s.vel[i * 3]; s.velStart[i * 3 + 1] = s.vel[i * 3 + 1]; s.velStart[i * 3 + 2] = s.vel[i * 3 + 2];
            s.angVelStart[i * 3] = s.angVel[i * 3]; s.angVelStart[i * 3 + 1] = s.angVel[i * 3 + 1]; s.angVelStart[i * 3 + 2] = s.angVel[i * 3 + 2];
            s.pos[i * 3] += s.vel[i * 3] * sdt; s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * sdt; s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * sdt;
            integrateQuat(s.orient, i, s.angVel[i * 3] * sdt, s.angVel[i * 3 + 1] * sdt, s.angVel[i * 3 + 2] * sdt);
        }

        // position iterations (Gauss-Seidel over pairs + static world)
        for (let iter = 0; iter < cfg.iterations; iter++) {
            for (let p = 0; p < pairCount; p++) {
                const a = pairA[p], b = pairB[p];
                narrowphase(s, a, b);
                for (let ci = 0; ci < _mCount; ci++) {
                    setContact(ci);
                    if (_contact.depth > 0) solvePosition(s, a, b, 0, sdt); // rigid (compliance deferred)
                }
            }
            for (let i = 0; i < s.count; i++) {
                if (s.dynamic[i] === 0) continue;
                resolveStatic(s, i, cfg);
            }
        }

        // finalize: velocity from pose delta
        for (let i = 0; i < s.count; i++) {
            if (s.dynamic[i] === 0) continue;
            s.vel[i * 3] = (s.pos[i * 3] - s.prevPos[i * 3]) / sdt;
            s.vel[i * 3 + 1] = (s.pos[i * 3 + 1] - s.prevPos[i * 3 + 1]) / sdt;
            s.vel[i * 3 + 2] = (s.pos[i * 3 + 2] - s.prevPos[i * 3 + 2]) / sdt;
            angVelFromDelta(s, i, sdt);
        }

        // velocity pass: restitution + friction over pairs + static world
        for (let p = 0; p < pairCount; p++) {
            const a = pairA[p], b = pairB[p];
            narrowphase(s, a, b);
            const e = Math.sqrt(s.restitution[a] * s.restitution[b]);
            const mu = Math.sqrt(s.friction[a] * s.friction[b]);
            for (let ci = 0; ci < _mCount; ci++) {
                setContact(ci);
                if (_contact.depth > 0) solveVelocity(s, a, b, e, mu, cfg.restitutionThreshold);
            }
        }
        for (let i = 0; i < s.count; i++) {
            if (s.dynamic[i] === 0) continue;
            resolveStaticVelocity(s, i, cfg);
        }
    }

    // sleep dynamic bodies that have come to rest
    for (let i = 0; i < s.count; i++) {
        if (s.dynamic[i] === 0) continue;
        const v2 = s.vel[i * 3] ** 2 + s.vel[i * 3 + 1] ** 2 + s.vel[i * 3 + 2] ** 2;
        const w2 = s.angVel[i * 3] ** 2 + s.angVel[i * 3 + 1] ** 2 + s.angVel[i * 3 + 2] ** 2;
        if (v2 < cfg.sleepLinear * cfg.sleepLinear && w2 < cfg.sleepAngular * cfg.sleepAngular) {
            s.sleeping[i] = 1;
            s.vel[i * 3] = 0; s.vel[i * 3 + 1] = 0; s.vel[i * 3 + 2] = 0;
            s.angVel[i * 3] = 0; s.angVel[i * 3 + 1] = 0; s.angVel[i * 3 + 2] = 0;
        } else {
            s.sleeping[i] = 0;
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

// static world (floor + bin walls) as immovable position constraints.
const _planeN = new Float32Array(15);
const _planeOff = new Float32Array(5);

function resolveStatic(s: SolverState, i: number, cfg: SolverConfig): void {
    setupPlanes(cfg);
    if (s.shape[i] === SHAPE_SPHERE) {
        const r = s.halfExtent[i * 3];
        for (let k = 0; k < (cfg.binExtent > 0 ? 5 : 1); k++) {
            const nx = _planeN[k * 3], ny = _planeN[k * 3 + 1], nz = _planeN[k * 3 + 2];
            const pen = _planeOff[k] - (s.pos[i * 3] * nx + s.pos[i * 3 + 1] * ny + s.pos[i * 3 + 2] * nz - r);
            if (pen > 0) staticPush(s, i, nx, ny, nz, s.pos[i * 3] - nx * r, s.pos[i * 3 + 1] - ny * r, s.pos[i * 3 + 2] - nz * r, pen);
        }
    } else {
        boxAxes(_ai, s, i);
        const h0 = s.halfExtent[i * 3], h1 = s.halfExtent[i * 3 + 1], h2 = s.halfExtent[i * 3 + 2];
        for (let c = 0; c < 8; c++) {
            const s0 = (c & 1) ? 1 : -1, s1 = (c & 2) ? 1 : -1, s2 = (c & 4) ? 1 : -1;
            const cx = s.pos[i * 3] + _ai[0] * h0 * s0 + _ai[3] * h1 * s1 + _ai[6] * h2 * s2;
            const cy = s.pos[i * 3 + 1] + _ai[1] * h0 * s0 + _ai[4] * h1 * s1 + _ai[7] * h2 * s2;
            const cz = s.pos[i * 3 + 2] + _ai[2] * h0 * s0 + _ai[5] * h1 * s1 + _ai[8] * h2 * s2;
            for (let k = 0; k < (cfg.binExtent > 0 ? 5 : 1); k++) {
                const nx = _planeN[k * 3], ny = _planeN[k * 3 + 1], nz = _planeN[k * 3 + 2];
                const pen = _planeOff[k] - (cx * nx + cy * ny + cz * nz);
                if (pen > 0) staticPush(s, i, nx, ny, nz, cx, cy, cz, pen);
            }
        }
    }
}

function staticPush(s: SolverState, i: number, nx: number, ny: number, nz: number, px: number, py: number, pz: number, depth: number): void {
    const rx = px - s.pos[i * 3], ry = py - s.pos[i * 3 + 1], rz = pz - s.pos[i * 3 + 2];
    const im = s.invMass[i];
    const rnx = ry * nz - rz * ny, rny = rz * nx - rx * nz, rnz = rx * ny - ry * nx;
    applyInvInertia(_gi, s.orient[i * 4], s.orient[i * 4 + 1], s.orient[i * 4 + 2], s.orient[i * 4 + 3], s.invInertia[i * 3], s.invInertia[i * 3 + 1], s.invInertia[i * 3 + 2], rnx, rny, rnz);
    const wA = im + rnx * _gi[0] + rny * _gi[1] + rnz * _gi[2];
    if (wA <= 0) return;
    const lambda = depth / wA;
    s.pos[i * 3] += im * lambda * nx; s.pos[i * 3 + 1] += im * lambda * ny; s.pos[i * 3 + 2] += im * lambda * nz;
    applyInvInertia(_gi, s.orient[i * 4], s.orient[i * 4 + 1], s.orient[i * 4 + 2], s.orient[i * 4 + 3], s.invInertia[i * 3], s.invInertia[i * 3 + 1], s.invInertia[i * 3 + 2], (ry * nz - rz * ny) * lambda, (rz * nx - rx * nz) * lambda, (rx * ny - ry * nx) * lambda);
    integrateQuat(s.orient, i, _gi[0], _gi[1], _gi[2]);
}

function resolveStaticVelocity(s: SolverState, i: number, cfg: SolverConfig): void {
    setupPlanes(cfg);
    const reach = s.shape[i] === SHAPE_SPHERE ? s.halfExtent[i * 3] : 0;
    boxAxes(_ai, s, i);
    const h0 = s.halfExtent[i * 3], h1 = s.halfExtent[i * 3 + 1], h2 = s.halfExtent[i * 3 + 2];
    const e = Math.sqrt(s.restitution[i] * cfg.worldRestitution);
    const mu = Math.sqrt(s.friction[i] * cfg.worldFriction);
    for (let k = 0; k < (cfg.binExtent > 0 ? 5 : 1); k++) {
        const nx = _planeN[k * 3], ny = _planeN[k * 3 + 1], nz = _planeN[k * 3 + 2];
        const support = s.shape[i] === SHAPE_SPHERE ? reach : extentAlong(_ai, h0, h1, h2, nx, ny, nz);
        const pen = _planeOff[k] - (s.pos[i * 3] * nx + s.pos[i * 3 + 1] * ny + s.pos[i * 3 + 2] * nz - support);
        if (pen <= 0) continue;
        const px = s.pos[i * 3] - nx * support, py = s.pos[i * 3 + 1] - ny * support, pz = s.pos[i * 3 + 2] - nz * support;
        const rx = px - s.pos[i * 3], ry = py - s.pos[i * 3 + 1], rz = pz - s.pos[i * 3 + 2];
        const vx = s.vel[i * 3] + (s.angVel[i * 3 + 1] * rz - s.angVel[i * 3 + 2] * ry);
        const vy = s.vel[i * 3 + 1] + (s.angVel[i * 3 + 2] * rx - s.angVel[i * 3] * rz);
        const vz = s.vel[i * 3 + 2] + (s.angVel[i * 3] * ry - s.angVel[i * 3 + 1] * rx);
        const vn = vx * nx + vy * ny + vz * nz;
        const sx = s.velStart[i * 3] + (s.angVelStart[i * 3 + 1] * rz - s.angVelStart[i * 3 + 2] * ry);
        const sy = s.velStart[i * 3 + 1] + (s.angVelStart[i * 3 + 2] * rx - s.angVelStart[i * 3] * rz);
        const sz = s.velStart[i * 3 + 2] + (s.angVelStart[i * 3] * ry - s.angVelStart[i * 3 + 1] * rx);
        const vnPre = sx * nx + sy * ny + sz * nz;
        const goalVn = vnPre < -cfg.restitutionThreshold ? Math.max(-e * vnPre, 0) : 0;
        const dvn = goalVn - vn;
        if (dvn > 0) staticVelImpulse(s, i, rx, ry, rz, nx, ny, nz, dvn);
        const vtx = vx - vn * nx, vty = vy - vn * ny, vtz = vz - vn * nz;
        const vtLen = Math.sqrt(vtx * vtx + vty * vty + vtz * vtz);
        if (vtLen > 1e-6 && mu > 0) {
            staticVelImpulse(s, i, rx, ry, rz, vtx / vtLen, vty / vtLen, vtz / vtLen, -mu * vtLen);
        }
    }
}

function staticVelImpulse(s: SolverState, i: number, rx: number, ry: number, rz: number, dx: number, dy: number, dz: number, dRel: number): void {
    const im = s.invMass[i];
    const rnx = ry * dz - rz * dy, rny = rz * dx - rx * dz, rnz = rx * dy - ry * dx;
    applyInvInertia(_gi, s.orient[i * 4], s.orient[i * 4 + 1], s.orient[i * 4 + 2], s.orient[i * 4 + 3], s.invInertia[i * 3], s.invInertia[i * 3 + 1], s.invInertia[i * 3 + 2], rnx, rny, rnz);
    const wA = im + rnx * _gi[0] + rny * _gi[1] + rnz * _gi[2];
    if (wA <= 0) return;
    const j = dRel / wA;
    s.vel[i * 3] += im * j * dx; s.vel[i * 3 + 1] += im * j * dy; s.vel[i * 3 + 2] += im * j * dz;
    s.angVel[i * 3] += _gi[0] * j; s.angVel[i * 3 + 1] += _gi[1] * j; s.angVel[i * 3 + 2] += _gi[2] * j;
}

function setupPlanes(cfg: SolverConfig): void {
    const h = cfg.binExtent;
    _planeN.set([0, 1, 0, 1, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1]);
    _planeOff[0] = cfg.floorY; _planeOff[1] = -h; _planeOff[2] = -h; _planeOff[3] = -h; _planeOff[4] = -h;
}
