// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * LBVH broadphase build (Karras 2012), run once per frame on the predicted
 * body poses before the solver. Replaces the solver's O(N²) neighbour scan with
 * an O(N log N) tree the solve kernel traverses. Six entry points, dispatched in
 * order within the physics compute pass (each dispatch sees the previous one's
 * writes — WebGPU synchronises storage between dispatches in a pass):
 *
 *   sceneBounds — single-workgroup reduction of all body centres → scene AABB,
 *                 used to normalise Morton coordinates.
 *   morton      — quantise each centre to a 30-bit Morton code (10 bits/axis);
 *                 dead padding slots get 0xFFFFFFFF so they sort to the end.
 *   bitonic     — one compare-exchange pass; dispatched O(log²N) times with a
 *                 dynamic-offset (j,k) uniform to sort (key,value) by key.
 *   build       — Karras parallel hierarchy: each internal node finds its range
 *                 + split via the δ common-prefix function and links children.
 *   leafBounds  — each leaf's AABB = its body's bounding sphere (+ margin).
 *   refit       — atomic bottom-up union of child AABBs into internal nodes.
 *
 * Node layout (2 vec4f / node, 2N-1 nodes; internal 0..N-2, leaves N-1..2N-2):
 *   nodes[2k]   = aabbMin.xyz + bitcast(leftChild)
 *   nodes[2k+1] = aabbMax.xyz + bitcast(rightChild)
 * Children/leaves index the same array; a child index ≥ N-1 is a leaf, whose
 * body id is vals[childIndex-(N-1)].
 */
export const broadphaseComputeShader = /* wgsl */ `
struct BParams { count: u32, npad: u32, margin: f32, _p: u32, }
struct Sort { j: u32, k: u32, _p0: u32, _p1: u32, }

@group(0) @binding(0) var<uniform> B: BParams;
@group(0) @binding(1) var<storage, read>       pose:   array<vec4f>;  // 2 / body (predicted)
@group(0) @binding(2) var<storage, read_write> bounds: array<vec4f>;  // [min, max]
@group(0) @binding(3) var<storage, read_write> keys:   array<u32>;
@group(0) @binding(4) var<storage, read_write> vals:   array<u32>;
@group(0) @binding(5) var<storage, read_write> nodes:  array<vec4f>;  // 2 / node
@group(0) @binding(6) var<storage, read_write> parent: array<u32>;
@group(0) @binding(7) var<storage, read_write> flags:  array<atomic<u32>>;
@group(0) @binding(8) var<uniform> S: Sort;

// --- scene bounds ------------------------------------------------------------
var<workgroup> wmin: array<vec3f, 256>;
var<workgroup> wmax: array<vec3f, 256>;

@compute @workgroup_size(256)
fn sceneBounds(@builtin(local_invocation_id) lid: vec3u) {
    let t = lid.x;
    var lo = vec3f(3.0e38);
    var hi = vec3f(-3.0e38);
    for (var i = t; i < B.count; i = i + 256u) {
        let c = pose[i * 2u].xyz;
        lo = min(lo, c);
        hi = max(hi, c);
    }
    wmin[t] = lo;
    wmax[t] = hi;
    workgroupBarrier();
    for (var s = 128u; s > 0u; s = s >> 1u) {
        if (t < s) {
            wmin[t] = min(wmin[t], wmin[t + s]);
            wmax[t] = max(wmax[t], wmax[t + s]);
        }
        workgroupBarrier();
    }
    if (t == 0u) {
        bounds[0] = vec4f(wmin[0], 0.0);
        bounds[1] = vec4f(wmax[0], 0.0);
    }
}

// --- Morton codes ------------------------------------------------------------
fn expandBits(v: u32) -> u32 {
    var x = v & 0x3FFu;
    x = (x | (x << 16u)) & 0x30000FFu;
    x = (x | (x << 8u)) & 0x300F00Fu;
    x = (x | (x << 4u)) & 0x30C30C3u;
    x = (x | (x << 2u)) & 0x9249249u;
    return x;
}

@compute @workgroup_size(64)
fn morton(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= B.npad) { return; }
    if (i >= B.count) {
        keys[i] = 0xFFFFFFFFu;  // padding sorts last
        vals[i] = i;
        return;
    }
    let lo = bounds[0].xyz;
    let hi = bounds[1].xyz;
    let extent = max(hi - lo, vec3f(1.0e-5));
    let n = clamp((pose[i * 2u].xyz - lo) / extent, vec3f(0.0), vec3f(1.0));
    let q = vec3u(n * 1023.0);
    keys[i] = (expandBits(q.x) << 2u) | (expandBits(q.y) << 1u) | expandBits(q.z);
    vals[i] = i;
}

// --- bitonic sort pass -------------------------------------------------------
@compute @workgroup_size(64)
fn bitonic(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= B.npad) { return; }
    let ixj = i ^ S.j;
    if (ixj > i) {
        let ascending = (i & S.k) == 0u;
        if ((keys[i] > keys[ixj]) == ascending) {
            let tk = keys[i]; keys[i] = keys[ixj]; keys[ixj] = tk;
            let tv = vals[i]; vals[i] = vals[ixj]; vals[ixj] = tv;
        }
    }
}

// --- Karras hierarchy --------------------------------------------------------
fn delta(i: i32, j: i32) -> i32 {
    if (j < 0 || j >= i32(B.count)) { return -1; }
    let ci = keys[u32(i)];
    let cj = keys[u32(j)];
    if (ci == cj) {
        return 32 + i32(countLeadingZeros(u32(i) ^ u32(j)));  // identical codes: extend by index
    }
    return i32(countLeadingZeros(ci ^ cj));
}

@compute @workgroup_size(64)
fn build(@builtin(global_invocation_id) gid: vec3u) {
    let i = i32(gid.x);
    if (i >= i32(B.count) - 1) { return; }

    let d = select(-1, 1, delta(i, i + 1) > delta(i, i - 1));
    let deltaMin = delta(i, i - d);
    var lmax = 2;
    while (delta(i, i + lmax * d) > deltaMin) { lmax = lmax * 2; }
    var l = 0;
    var t = lmax / 2;
    while (t >= 1) {
        if (delta(i, i + (l + t) * d) > deltaMin) { l = l + t; }
        t = t / 2;
    }
    let j = i + l * d;

    let deltaNode = delta(i, j);
    var s = 0;
    var stride = l;
    loop {
        stride = (stride + 1) >> 1;
        if (delta(i, i + (s + stride) * d) > deltaNode) { s = s + stride; }
        if (stride <= 1) { break; }
    }
    let gamma = i + s * d + min(d, 0);

    let lo = min(i, j);
    let hi = max(i, j);
    let leafBase = B.count - 1u;
    var left = u32(gamma);
    if (gamma == lo) { left = leafBase + u32(gamma); }
    var right = u32(gamma + 1);
    if (gamma + 1 == hi) { right = leafBase + u32(gamma + 1); }

    nodes[u32(i) * 2u]      = vec4f(nodes[u32(i) * 2u].xyz, bitcast<f32>(left));
    nodes[u32(i) * 2u + 1u] = vec4f(nodes[u32(i) * 2u + 1u].xyz, bitcast<f32>(right));
    parent[left] = u32(i);
    parent[right] = u32(i);
}

// --- leaf AABBs + bottom-up refit -------------------------------------------
@compute @workgroup_size(64)
fn leafBounds(@builtin(global_invocation_id) gid: vec3u) {
    let k = gid.x;
    if (k >= B.count) { return; }
    let body = vals[k];
    let c = pose[body * 2u].xyz;
    let r = pose[body * 2u].w + B.margin;
    let node = (B.count - 1u) + k;
    nodes[node * 2u]      = vec4f(c - r, nodes[node * 2u].w);
    nodes[node * 2u + 1u] = vec4f(c + r, nodes[node * 2u + 1u].w);
}

@compute @workgroup_size(64)
fn refit(@builtin(global_invocation_id) gid: vec3u) {
    let k = gid.x;
    if (k >= B.count) { return; }
    var node = parent[(B.count - 1u) + k];
    loop {
        // Only the second child to arrive proceeds — by then both child AABBs exist.
        if (atomicAdd(&flags[node], 1u) == 0u) { return; }
        let l = bitcast<u32>(nodes[node * 2u].w);
        let r = bitcast<u32>(nodes[node * 2u + 1u].w);
        let mn = min(nodes[l * 2u].xyz, nodes[r * 2u].xyz);
        let mx = max(nodes[l * 2u + 1u].xyz, nodes[r * 2u + 1u].xyz);
        nodes[node * 2u]      = vec4f(mn, nodes[node * 2u].w);
        nodes[node * 2u + 1u] = vec4f(mx, nodes[node * 2u + 1u].w);
        if (node == 0u) { return; }
        node = parent[node];
    }
}
`;
