// © 2026 Adobe. MIT License. See /LICENSE for details.

// All-in-one compute module for the boids sample. Five entry points share one
// bind group layout so we can swap ping-pong groups without rebuilding
// pipelines. State is exchanged through bindings 1 (read) and 2 (write); on
// alternating frames the bound buffers are swapped.
export const computeShader = /* wgsl */ `
struct Params {
    dt: f32,
    cellSize: f32,
    worldExtent: f32,
    boidsCount: u32,
    gridDim: u32,
    cellCount: u32,
    indexCount: u32,
    separationDist: f32,
    separationGain: f32,
    alignmentGain: f32,
    cohesionGain: f32,
    maxSpeed: f32,
    // Scare ray origin (eye): xyz = world position, w = 1 when active else 0.
    scareOrigin: vec4f,
    // Scare ray direction (unit, eye → cursor through far plane). xyz used; w padding.
    scareDir: vec4f,
    // x = radius (perpendicular distance cap), y = gain. zw padding.
    scareTuning: vec4f,
}

struct BoidState {
    pos: vec4f,
    vel: vec4f,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       readState:        array<BoidState>;
@group(0) @binding(2) var<storage, read_write> writeState:       array<BoidState>;
@group(0) @binding(3) var<storage, read_write> cellCounts:       array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> cellOffsets:      array<u32>;
@group(0) @binding(5) var<storage, read_write> cellWriteCursors: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> sortedIndices:    array<u32>;
@group(0) @binding(7) var<storage, read_write> drawArgs:         array<u32>;

fn cellIndexOf(pos: vec3f) -> u32 {
    let half = P.worldExtent;
    let gd = i32(P.gridDim);
    let p  = (pos + vec3f(half)) / P.cellSize;
    let c  = clamp(vec3i(p), vec3i(0), vec3i(gd - 1));
    return u32(c.z * gd * gd + c.y * gd + c.x);
}

@compute @workgroup_size(64)
fn clear_cells(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.cellCount) { return; }
    atomicStore(&cellCounts[i], 0u);
}

@compute @workgroup_size(64)
fn populate_grid(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.boidsCount) { return; }
    let cell = cellIndexOf(readState[i].pos.xyz);
    atomicAdd(&cellCounts[cell], 1u);
}

// Single-thread exclusive prefix sum over cellCounts → cellOffsets, also
// initialises cellWriteCursors so binBoids can atomic-scatter. ~512 iters at
// gridDim=8 — sub-microsecond on any GPU.
@compute @workgroup_size(1)
fn prefix_sum() {
    var sum: u32 = 0u;
    for (var i: u32 = 0u; i < P.cellCount; i = i + 1u) {
        let c = atomicLoad(&cellCounts[i]);
        cellOffsets[i] = sum;
        atomicStore(&cellWriteCursors[i], sum);
        sum = sum + c;
    }
}

@compute @workgroup_size(64)
fn bin_boids(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.boidsCount) { return; }
    let cell  = cellIndexOf(readState[i].pos.xyz);
    let slot  = atomicAdd(&cellWriteCursors[cell], 1u);
    sortedIndices[slot] = i;
}

@compute @workgroup_size(64)
fn update_boids(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= P.boidsCount) { return; }

    let me  = readState[i];
    let pos = me.pos.xyz;
    let vel = me.vel.xyz;

    let half = P.worldExtent;
    let gd   = i32(P.gridDim);
    let myCell = clamp(vec3i((pos + vec3f(half)) / P.cellSize), vec3i(0), vec3i(gd - 1));

    var cohesion   = vec3f(0.0);
    var alignment  = vec3f(0.0);
    var separation = vec3f(0.0);
    var neighbors: u32 = 0u;
    let sepR2  = P.separationDist * P.separationDist;
    let viewR2 = sepR2 * 4.0;

    for (var dz: i32 = -1; dz <= 1; dz = dz + 1) {
        for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
            for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
                let nc = myCell + vec3i(dx, dy, dz);
                if (any(nc < vec3i(0)) || any(nc >= vec3i(gd))) { continue; }
                let cell  = u32(nc.z * gd * gd + nc.y * gd + nc.x);
                let start = cellOffsets[cell];
                let count = atomicLoad(&cellCounts[cell]);
                for (var k: u32 = 0u; k < count; k = k + 1u) {
                    let other = sortedIndices[start + k];
                    if (other == i) { continue; }
                    let os    = readState[other];
                    let d     = os.pos.xyz - pos;
                    let dist2 = dot(d, d);
                    if (dist2 < 0.0001 || dist2 > viewR2) { continue; }
                    cohesion  = cohesion + os.pos.xyz;
                    alignment = alignment + os.vel.xyz;
                    if (dist2 < sepR2) {
                        separation = separation - d / sqrt(dist2);
                    }
                    neighbors = neighbors + 1u;
                }
            }
        }
    }

    var newVel = vel;
    if (neighbors > 0u) {
        let nf = f32(neighbors);
        let cohForce = (cohesion / nf - pos) * P.cohesionGain;
        let alnForce = (alignment / nf - vel) * P.alignmentGain;
        let sepForce =  separation             * P.separationGain;
        newVel = newVel + (cohForce + alnForce + sepForce) * P.dt;
    }

    // Cursor scare: outward force perpendicular to the eye→cursor ray.
    // Boids near the line — at any depth — feel it, proportional to how
    // close they are to the line. Boids behind the camera are ignored.
    if (P.scareOrigin.w > 0.5) {
        let origin = P.scareOrigin.xyz;
        let dir    = P.scareDir.xyz;
        let toBoid = pos - origin;
        let tAlong = dot(toBoid, dir);
        if (tAlong > 0.0) {
            let perp = toBoid - dir * tAlong;
            let d2   = dot(perp, perp);
            let r    = P.scareTuning.x;
            if (d2 < r * r && d2 > 0.0001) {
                let d        = sqrt(d2);
                let strength = (1.0 - d / r) * P.scareTuning.y;
                newVel = newVel + (perp / d) * strength * P.dt;
            }
        }
    }

    let speed = length(newVel);
    if (speed > P.maxSpeed) {
        newVel = newVel * (P.maxSpeed / speed);
    } else if (speed < 0.5) {
        // Give isolated boids a small forward kick so they don't stall.
        newVel = newVel + vec3f(0.0, 0.0, 0.5) * P.dt;
    }

    // Toroidal wrap-around: flocks never hit a wall, they flow through.
    var newPos = pos + newVel * P.dt;
    let extent = P.worldExtent;
    let size   = 2.0 * extent;
    newPos = ((newPos + vec3f(extent)) - floor((newPos + vec3f(extent)) / size) * size) - vec3f(extent);

    writeState[i] = BoidState(vec4f(newPos, 0.0), vec4f(newVel, 0.0));

    // Boid 0 writes the indirect draw args for the render pass.
    if (i == 0u) {
        drawArgs[0] = P.indexCount;
        drawArgs[1] = P.boidsCount;
        drawArgs[2] = 0u;
        drawArgs[3] = 0u;
        drawArgs[4] = 0u;
    }
}
`;

export const renderShader = /* wgsl */ `
struct SceneUniforms {
    viewProjectionMatrix: mat4x4<f32>,
    lightDirection: vec3f,
    ambientStrength: f32,
    lightColor: vec3f,
    cameraPosition: vec3f,
}

struct BoidState {
    pos: vec4f,
    vel: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<storage, read> boids: array<BoidState>;

struct VIn {
    @location(0) position: vec3f,
    @location(1) normal:   vec3f,
}

struct VOut {
    @builtin(position) clip:        vec4f,
    @location(0)       worldNormal: vec3f,
    @location(1)       color:       vec3f,
}

@vertex
fn vs_main(@builtin(instance_index) ii: u32, in: VIn) -> VOut {
    let state = boids[ii];
    let pos = state.pos.xyz;
    let vel = state.vel.xyz;

    // Build a TBN with forward = velocity direction.
    let forward = normalize(vel + vec3f(0.0001, 0.0, 0.0));
    let upHint  = vec3f(0.0, 1.0, 0.0);
    let right   = normalize(cross(forward, upHint));
    let up      = cross(right, forward);

    let worldPos    = pos
        + in.position.x * right
        + in.position.y * up
        + in.position.z * forward;
    let worldNormal = in.normal.x * right
        + in.normal.y * up
        + in.normal.z * forward;

    var out: VOut;
    out.clip        = scene.viewProjectionMatrix * vec4f(worldPos, 1.0);
    out.worldNormal = worldNormal;
    // Hue from facing direction: ±x, ±y, ±z each map to a distinct RGB
    // wedge by remapping the unit vector from [-1,1] to [0,1] per channel.
    // Intensity from speed: slow boids dim, fast ones bright.
    let hue       = (forward + vec3f(1.0)) * 0.5;
    let speedT    = saturate(length(vel) / 5.0);
    let intensity = mix(0.35, 1.0, speedT);
    out.color = hue * intensity;
    return out;
}

@fragment
fn fs_main(in: VOut) -> @location(0) vec4f {
    let n    = normalize(in.worldNormal);
    let L    = normalize(-scene.lightDirection);
    let diff = max(dot(n, L), 0.0);
    let lit  = in.color * (scene.ambientStrength + diff * scene.lightColor);
    return vec4f(lit, 1.0);
}
`;
