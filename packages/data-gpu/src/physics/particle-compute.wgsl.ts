// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Query-only ephemeral particles. One-way coupling: each particle reads the
 * rigid bodies' final positions (read-only) and the static world, bounces off
 * them, and never writes body state nor collides with other particles — so it
 * never enters the broadphase. Each thread owns one particle row (write-self,
 * no atomics). A particle that runs out of life or bounces respawns from the
 * emitter, giving a steady fountain that recycles dead slots in place.
 *
 * Per particle (3 × vec4f = 48 B):
 *   a = pos.xyz + life          (life = remaining seconds)
 *   b = prevPos.xyz + size      (size = radius)
 *   c = vel.xyz + bounces       (bounces = reflections remaining)
 *
 * Body-body neighbour search is brute-force O(bodyCount) per particle — the
 * same placeholder as the rigid solver, swapped for an LBVH traversal later.
 * Collision is discrete (no sweep), so very fast small particles can tunnel;
 * acceptable for sparks, revisited with the swept test.
 */
export const particleComputeShader = /* wgsl */ `
struct PParams {
    dt:            f32,
    gravity:       f32,
    floorY:        f32,
    halfExtent:    f32,
    restitution:   f32,
    frame:         u32,
    bodyCount:     u32,
    particleCount: u32,
}

@group(0) @binding(0) var<uniform> PP: PParams;
@group(0) @binding(1) var<storage, read>       bodies:    array<vec4f>;  // pose: 2 / body, [pos.xyz + boundingRadius, quat]
@group(0) @binding(2) var<storage, read_write> particles: array<vec4f>;  // 3 vec4f per particle

fn pcg(v: u32) -> u32 {
    let state = v * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
fn rnd(seed: u32) -> f32 { return f32(pcg(seed)) / 4294967296.0; }

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= PP.particleCount) { return; }
    let base = i * 3u;
    let a = particles[base + 0u];
    let b = particles[base + 1u];
    let c = particles[base + 2u];

    var pos = a.xyz;
    var life = a.w;
    var size = b.w;
    var vel = c.xyz;
    var bounces = c.w;
    var prev = pos;

    if (life <= 0.0 || bounces < 0.0 || size <= 0.0) {
        // Respawn from the emitter above the pile, raining down and outward.
        let s = i * 9781u + PP.frame * 6271u;
        let ang = rnd(s) * 6.2831853;
        let spread = rnd(s + 1u) * 1.5;
        pos = vec3f(cos(ang) * spread, PP.floorY + 22.0, sin(ang) * spread);
        let outward = 1.5 + rnd(s + 2u) * 3.0;
        vel = vec3f(cos(ang) * outward, -(2.0 + rnd(s + 3u) * 4.0), sin(ang) * outward);
        life = 3.0 + rnd(s + 4u) * 2.0;
        bounces = 3.0 + floor(rnd(s + 5u) * 3.0);  // 3–5 bounces
        size = 0.08 + rnd(s + 6u) * 0.06;
        prev = pos;
    } else {
        prev = pos;
        vel.y = vel.y - PP.gravity * PP.dt;
        pos = pos + vel * PP.dt;
        life = life - PP.dt;

        // Deepest penetration among bodies + static world; resolve one per frame.
        var bestPen = 0.0;
        var bestN = vec3f(0.0);
        for (var j = 0u; j < PP.bodyCount; j = j + 1u) {
            let o = bodies[j * 2u];  // treat every body as its bounding sphere
            let d = pos - o.xyz;
            let dist = length(d);
            let pen = (size + o.w) - dist;
            if (pen > bestPen && dist > 1e-5) {
                bestPen = pen;
                bestN = d / dist;
            }
        }
        let h = PP.halfExtent;
        let floorPen = (PP.floorY + size) - pos.y;
        if (floorPen > bestPen) { bestPen = floorPen; bestN = vec3f(0.0, 1.0, 0.0); }
        if (-(pos.x - size) - h > bestPen) { bestPen = -(pos.x - size) - h; bestN = vec3f( 1.0, 0.0, 0.0); }
        if ( (pos.x + size) - h > bestPen) { bestPen =  (pos.x + size) - h; bestN = vec3f(-1.0, 0.0, 0.0); }
        if (-(pos.z - size) - h > bestPen) { bestPen = -(pos.z - size) - h; bestN = vec3f(0.0, 0.0,  1.0); }
        if ( (pos.z + size) - h > bestPen) { bestPen =  (pos.z + size) - h; bestN = vec3f(0.0, 0.0, -1.0); }

        if (bestPen > 0.0) {
            pos = pos + bestN * bestPen;
            let vn = dot(vel, bestN);
            if (vn < 0.0) {
                vel = vel - (1.0 + PP.restitution) * vn * bestN;
            }
            bounces = bounces - 1.0;
        }
    }

    particles[base + 0u] = vec4f(pos, life);
    particles[base + 1u] = vec4f(prev, size);
    particles[base + 2u] = vec4f(vel, bounces);
}
`;
