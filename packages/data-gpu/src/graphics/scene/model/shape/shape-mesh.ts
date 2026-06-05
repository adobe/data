// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Procedural unit-shape meshes in the StandardVertex packed layout
 * (position vec3, normal vec3, tangent vec4, uv vec2 — 12 floats/vertex), so
 * they feed the same PBR pipeline and `StandardVertex.layout` as glTF meshes.
 * Unit-sized (radius / half-extent 1): a Node `scale` sets the real size, so a
 * cuboid is the unit cube scaled by its half-extents and a sphere is the unit
 * sphere scaled by its radius.
 */
export interface ShapeMesh {
    vertices: Float32Array;
    indices: Uint16Array;
}

function push(out: number[], px: number, py: number, pz: number, nx: number, ny: number, nz: number, tx: number, ty: number, tz: number, tw: number, u: number, v: number): void {
    out.push(px, py, pz, nx, ny, nz, tx, ty, tz, tw, u, v);
}

/** UV sphere, radius 1, centred at origin. */
export function unitSphere(rings = 24, segments = 48): ShapeMesh {
    const verts: number[] = [];
    for (let ring = 0; ring <= rings; ring++) {
        const theta = (ring / rings) * Math.PI;
        const st = Math.sin(theta), ct = Math.cos(theta);
        for (let seg = 0; seg <= segments; seg++) {
            const phi = (seg / segments) * Math.PI * 2;
            const sp = Math.sin(phi), cp = Math.cos(phi);
            const x = st * cp, y = ct, z = st * sp;
            // tangent = d(pos)/dphi, normalized; degenerate at the poles.
            let tx = -sp, ty = 0, tz = cp;
            const tl = Math.hypot(tx, ty, tz);
            if (tl < 1e-5) { tx = 1; ty = 0; tz = 0; } else { tx /= tl; tz /= tl; }
            push(verts, x, y, z, x, y, z, tx, ty, tz, 1, seg / segments, ring / rings);
        }
    }
    const indices: number[] = [];
    const stride = segments + 1;
    for (let ring = 0; ring < rings; ring++) {
        for (let seg = 0; seg < segments; seg++) {
            const a = ring * stride + seg, b = a + stride;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(indices) };
}

interface Face { n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }

// u × v = n for every face, so [c0,c1,c2,c0,c2,c3] winds CCW outward (back-cull).
const CUBE_FACES: Face[] = [
    { n: [1, 0, 0],  u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1],  v: [0, 1, 0] },
    { n: [0, 1, 0],  u: [1, 0, 0],  v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0],  v: [0, 0, 1] },
    { n: [0, 0, 1],  u: [1, 0, 0],  v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

/**
 * Flat-shaded StandardVertex mesh from a triangle soup (positions + indices) —
 * one face normal per triangle, three unique verts per triangle. Used to render
 * an authored static-mesh collider. Indices are emitted as `uint16`, so this is
 * for the modest authored meshes (ramps, props) of the current shape path, not
 * dense terrain (which would need a `uint32`-indexed primitive).
 */
export function flatShadedMesh(positions: Float32Array, indices: ArrayLike<number>): ShapeMesh {
    const verts: number[] = [], out: number[] = [];
    for (let t = 0; t < indices.length; t += 3) {
        const ia = indices[t] * 3, ib = indices[t + 1] * 3, ic = indices[t + 2] * 3;
        const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
        const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
        const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
        let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        let tx = bx - ax, ty = by - ay, tz = bz - az;
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const base = verts.length / 12;
        push(verts, ax, ay, az, nx, ny, nz, tx, ty, tz, 1, 0, 0);
        push(verts, bx, by, bz, nx, ny, nz, tx, ty, tz, 1, 1, 0);
        push(verts, cx, cy, cz, nx, ny, nz, tx, ty, tz, 1, 0, 1);
        out.push(base, base + 1, base + 2);
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(out) };
}

/**
 * Y-aligned capsule: a cylinder (radius `r`, half-height `halfHeight`) capped by
 * two hemispheres of radius `r`, centred at the origin (total height
 * 2·(halfHeight + r)). Unlike the sphere/cube, a capsule has two independent
 * dimensions and spherical caps that must not distort under non-uniform scale —
 * so it is built at its real size and rendered with unit scale (the bridge caches
 * one mesh per distinct radius/half-height). Rings run top pole → bottom pole;
 * the two equator rings (`ny = 0`, full radius) bound the straight cylinder wall.
 */
export function capsuleMesh(r: number, halfHeight: number, capRings = 8, segments = 24): ShapeMesh {
    const rows: { y: number; rr: number; ny: number }[] = [];
    for (let i = 0; i <= capRings; i++) {               // top cap: pole → equator
        const a = (i / capRings) * (Math.PI / 2);
        rows.push({ y: halfHeight + r * Math.cos(a), rr: r * Math.sin(a), ny: Math.cos(a) });
    }
    rows.push({ y: -halfHeight, rr: r, ny: 0 });          // cylinder bottom rim
    for (let i = 1; i <= capRings; i++) {               // bottom cap: equator → pole
        const b = (i / capRings) * (Math.PI / 2);
        rows.push({ y: -halfHeight - r * Math.sin(b), rr: r * Math.cos(b), ny: -Math.sin(b) });
    }
    const verts: number[] = [];
    const stride = segments + 1;
    for (let row = 0; row < rows.length; row++) {
        const { y, rr, ny } = rows[row];
        const rad = Math.sqrt(Math.max(0, 1 - ny * ny)); // radial component of the unit normal
        for (let seg = 0; seg <= segments; seg++) {
            const phi = (seg / segments) * Math.PI * 2;
            const cp = Math.cos(phi), sp = Math.sin(phi);
            push(verts, rr * cp, y, rr * sp, rad * cp, ny, rad * sp, -sp, 0, cp, 1, seg / segments, row / (rows.length - 1));
        }
    }
    const indices: number[] = [];
    for (let row = 0; row < rows.length - 1; row++) {
        for (let seg = 0; seg < segments; seg++) {
            const a = row * stride + seg, b = a + stride;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(indices) };
}

/** Cube spanning [-1, 1] on each axis, one material-space UV per face. */
export function unitCube(): ShapeMesh {
    const verts: number[] = [];
    const indices: number[] = [];
    let base = 0;
    for (const f of CUBE_FACES) {
        const [nx, ny, nz] = f.n, [ux, uy, uz] = f.u, [vx, vy, vz] = f.v;
        const corner = (su: number, sv: number, tu: number, tv: number): void => {
            push(verts,
                nx + su * ux + sv * vx, ny + su * uy + sv * vy, nz + su * uz + sv * vz,
                nx, ny, nz, ux, uy, uz, 1, tu, tv);
        };
        corner(-1, -1, 0, 0);
        corner(1, -1, 1, 0);
        corner(1, 1, 1, 1);
        corner(-1, 1, 0, 1);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        base += 4;
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(indices) };
}
