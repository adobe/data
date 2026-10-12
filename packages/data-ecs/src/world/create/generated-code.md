# Generated kernel code

What one kernel system compiles to on each backend. Calls into the math types are inlined into scalar statements in the
Program IR, and JS, WASM and WGSL are each generated from that IR; no backend calls `Vec3.add`.

## Regenerating

1. Save the test below as `src/scratch/show.test.ts`. Put your system in `source`, and declare `columns` in the order of
   the description's `columns` (printed first): one entry per field leaf, then an `f64` entry per `changed` or `chunks` column.
2. Run `npx vitest run src/scratch/show.test.ts`. It prints the rewritten module (with the description and program), the
   JS kernel module and the WGSL, and writes the WASM to `/tmp/kernel.wasm`.
3. To read the WASM: `npm install wabt` in a scratch directory, then `node_modules/wabt/bin/wasm2wat --enable-all /tmp/kernel.wasm`.
4. Delete `src/scratch`.

```ts
import { test } from 'vitest';
import { parseAst } from 'vite';
import { writeFileSync } from 'node:fs';
import { transformKernels } from '../compiler/transform.js';
import { loadBuiltins } from '../compiler/builtins.js';
import { mathDirectory, mathEntry } from '../compiler/paths.js';
import { generateWgsl } from '../world/create/wgsl.js';
import { generateWasm } from '../world/create/wasm.js';

test("show", async () => {
    const strip = async (code: string, file: string) => file.endsWith(".ts") ? (await (await import("vite")).transformWithEsbuild(code, file, { loader: "ts" })).code : code;
    const builtins = loadBuiltins(mathDirectory, mathEntry, parseAst, strip);
    const source = `import { System, Vec3 } from "ecs";
const position = "position"; const velocity = "velocity";
const move = System.create({ name: "move", kernel: "gpu", query: { read: [position, velocity], write: [position] } },
    row => { row[position] = Vec3.add(row[position], row[velocity]); });`;
    const result = await transformKernels(source, "/move.js", parseAst, async s => s === "ecs", i => JSON.stringify(`kernel:${i}`),
        { fileOf: async s => s === "ecs" ? mathEntry : null, builtins: () => builtins });
    if (result === null || "failure" in result) throw new Error(JSON.stringify(result));
    console.log(result.code);
    console.log(result.kernels[0]);
    const description = result.code.slice(result.code.indexOf("program: ") + 9);
    const program = new Function(`return ${description.slice(0, description.lastIndexOf("\n}")).replace(/,\s*$/, "")}`)();
    // position[0], velocity[0], position[1], velocity[1], position[2], velocity[2], then the changed and chunks ticks.
    const columns = [
        ...[0, 1, 2, 3, 4, 5].map(i => ({ view: "f32" as const, stride: 12, offset: Math.floor(i / 2) * 4, boolean: false, component: i % 2 })),
        ...[0, 1].map(() => ({ view: "f64" as const, stride: 8, offset: 0, boolean: false, component: -1 })),
    ];
    const wgsl = generateWgsl(program, columns, () => "number");
    console.log(typeof wgsl === "string" ? wgsl : wgsl.code);
    const wasm = generateWasm(program, columns, () => "number", true);
    if (wasm !== null) writeFileSync("/tmp/kernel.wasm", wasm.bytes);
});
```

## Example: `row => { row[position] = Vec3.add(row[position], row[velocity]); }`

`position` and `velocity` are `Vec3` components, each 12 bytes per row.

### JS (the row loop of the kernel module)

Local names come from `Vec3.add`'s own parameters.

```js
rows: for (let i = start, x0 = start * s0 + o0, /* … x6 */; i < end; i++, x0 += s0, /* … */) {
let x1_0 = c0[x0];
let y1_2 = c2[x2];
let z1_4 = c4[x4];
let x2_1 = c1[x1];
let y2_3 = c3[x3];
let z2_5 = c5[x5];
c0[x0] = (x1_0 + x2_1);
c2[x2] = (y1_2 + y2_3);
c4[x4] = (z1_4 + z2_5);
c6[x6] = tick;
}
```

### WGSL

The shader also carries a fixed preamble (`isNan`, `jsMin`, `remainder`, ...) for operators that need JS semantics; it's omitted here.

```wgsl
fn kernelRow(row: u32) {
    var x1_0: f32 = 0.0;
    var y1_2: f32 = 0.0;
    var z1_4: f32 = 0.0;
    var x2_1: f32 = 0.0;
    var y2_3: f32 = 0.0;
    var z2_5: f32 = 0.0;
    x1_0 = bitcast<f32>(memory[parameters[1] + row * 3u + 0u]);
    y1_2 = bitcast<f32>(memory[parameters[3] + row * 3u + 1u]);
    z1_4 = bitcast<f32>(memory[parameters[5] + row * 3u + 2u]);
    x2_1 = bitcast<f32>(memory[parameters[2] + row * 3u + 0u]);
    y2_3 = bitcast<f32>(memory[parameters[4] + row * 3u + 1u]);
    z2_5 = bitcast<f32>(memory[parameters[6] + row * 3u + 2u]);
    memory[parameters[1] + row * 3u + 0u] = bitcast<u32>((x1_0 + x2_1));
    memory[parameters[3] + row * 3u + 1u] = bitcast<u32>((y1_2 + y2_3));
    memory[parameters[5] + row * 3u + 2u] = bitcast<u32>((z1_4 + z2_5));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(num_workgroups) groups: vec3u) {
    let row = id.x + id.y * groups.x * 64u;
    if (row >= parameters[0]) { return; }
    kernelRow(row);
}
```

### WASM (499 bytes, excerpts from `wasm2wat`)

Three loops: chunk stamps, four rows at a time, then one row at a time for the rest.

```wat
;; Four rows: 48 bytes per component, three v128 loads each.
local.get 4  …  v128.load align=4              ;; position
local.get 4  …  v128.load offset=16 align=4
local.get 4  …  v128.load offset=32 align=4
local.get 5  …  v128.load align=4              ;; velocity, likewise
…
local.get 22  local.get 25  f32x4.add  …  v128.store align=4
local.get 23  local.get 26  f32x4.add  …  v128.store offset=16 align=4
local.get 24  local.get 27  f32x4.add  …  v128.store offset=32 align=4
local.get 2   f64x2.splat   v128.store align=8   ;; changed ticks, two rows per store

;; One row: x, y and z as one f32x4.
v128.load align=4                              ;; position
v128.load align=4                              ;; velocity
f32x4.add
v128.store64_lane align=4 0                    ;; x, y
v128.store32_lane offset=8 2                   ;; z
```

The one-row loads read 16 bytes of a 12-byte element; columns keep `columnSlack` bytes after their last row for that.
The stores write only the element's 12 bytes.
