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
