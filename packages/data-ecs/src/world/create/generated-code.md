# Generated kernel code

What one kernel system compiles to on each backend. Calls are inlined into the Program IR, and JS, WASM and WGSL are each
generated from it. A GPU kernel's calls to math functions that declare a WGSL builtin become regions: WGSL emits the
builtin, and JS and WASM run the inlined body.

## Regenerating

1. Save the test below as `src/scratch/show.test.ts`, with your system in `source`. The column layout is derived from
   the description, for components of three f32 leaves; adjust `columns` for other components.
2. Run `npx vitest run src/scratch/show.test.ts`. It prints the rewritten module (with the description and program), the
   JS kernel module and the WGSL, and writes the WASM to `/tmp/kernel.wasm`.
3. To read the WASM: `npm install wabt` in a scratch directory, then `node_modules/wabt/bin/wasm2wat --enable-all /tmp/kernel.wasm`.
4. Delete `src/scratch`.

```ts
import { test } from 'vitest';
import { parseAst } from 'vite';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { transformKernels } from '../compiler/transform.js';
import { createLinker } from '../compiler/link.js';
import { packageIndex } from '../compiler/paths.js';
import { generateWgsl } from '../world/create/wgsl.js';
import { generateWasm, type WasmColumn } from '../world/create/wasm.js';

test("show", async () => {
    const source = `import { System, Vec3 } from "@adobe/data-ecs";
const position = "position"; const velocity = "velocity";
const move = System.create({ name: "move", kernel: "gpu", query: { read: [position, velocity], write: [position] } },
    row => { row[position] = Vec3.add(row[position], row[velocity]); });`;
    // Resolves the package to its source and relative imports to files, stripping types as the plugin does.
    const linker = createLinker({
        resolve: async (specifier, importer) => {
            if (specifier === "@adobe/data-ecs") return packageIndex;
            const path = resolve(dirname(importer), specifier);
            return existsSync(path.replace(/\.js$/, ".ts")) ? path.replace(/\.js$/, ".ts") : path;
        },
        load: async file => {
            const code = await readFile(file, "utf8");
            return { code: file.endsWith(".ts") ? (await (await import("vite")).transformWithEsbuild(code, file, { loader: "ts" })).code : code };
        },
    }, parseAst);
    const result = await transformKernels(source, "/move.js", parseAst, async s => s === "@adobe/data-ecs", i => JSON.stringify(`kernel:${i}`), linker);
    if (result === null || "failure" in result) throw new Error(JSON.stringify(result));
    console.log(result.code);
    console.log(result.kernels[0]);
    // The description, with component keys bound to their names.
    const text = result.code.slice(result.code.indexOf("attachKernel$(") + 14);
    const { columns: described, program } = new Function("position", "velocity", `return ${text.slice(text.indexOf("}), {") + 3, text.lastIndexOf("});") + 1)};`)("position", "velocity");
    // Each component is three f32 leaves of one row; tick columns are f64.
    const columns: WasmColumn[] = described.map((column: { kind: string; component: string; path: number[] }) => column.kind === "field"
        ? { view: "f32", stride: 12, offset: column.path[0] * 4, boolean: false, component: column.component === "position" ? 0 : 1 }
        : { view: "f64", stride: 8, offset: 0, boolean: false, component: -1 });
    const wgsl = generateWgsl(program, columns, () => "number");
    console.log(typeof wgsl === "string" ? wgsl : wgsl.code);
    const wasm = generateWasm(program, columns, () => "number", true);
    if (wasm !== null) writeFileSync("/tmp/kernel.wasm", wasm.bytes);
});
```

## Example: `row => { row[position] = Vec3.add(row[position], row[velocity]); }`

`position` and `velocity` are `Vec3` components, each 12 bytes per row, in a `kernel: "gpu"` system.

### JS (the row loop of the kernel module)

Local names come from `Vec3.add`'s own parameters.

```js
rows: for (let i = start, x0 = start * s0 + o0, /* … x6 */; i < end; i++, x0 += s0, /* … */) {
let x1_0 = c0[x0];
let y1_1 = c1[x1];
let z1_2 = c2[x2];
let x2_3 = c3[x3];
let y2_4 = c4[x4];
let z2_5 = c5[x5];
c0[x0] = (x1_0 + x2_3);
c1[x1] = (y1_1 + y2_4);
c2[x2] = (z1_2 + z2_5);
c6[x6] = tick;
}
```

### WGSL

`Vec3.add` declares WGSL's `+` on `vec3f`, so the shader adds vectors; its result is named after the function. The
shader also carries a short preamble (`toUint32`, `power`, `roundHalfUp`) for operators whose JS results differ from
WGSL's on finite values; it's omitted here.

```wgsl
fn kernelRow(row: u32) {
    var add_6: vec3f;
    add_6 = (vec3f(bitcast<f32>(memory[parameters[1] + row * 3u + 0u]), bitcast<f32>(memory[parameters[2] + row * 3u + 1u]), bitcast<f32>(memory[parameters[3] + row * 3u + 2u])) + vec3f(bitcast<f32>(memory[parameters[4] + row * 3u + 0u]), bitcast<f32>(memory[parameters[5] + row * 3u + 1u]), bitcast<f32>(memory[parameters[6] + row * 3u + 2u])));
    memory[parameters[1] + row * 3u + 0u] = bitcast<u32>(add_6.x);
    memory[parameters[2] + row * 3u + 1u] = bitcast<u32>(add_6.y);
    memory[parameters[3] + row * 3u + 2u] = bitcast<u32>(add_6.z);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(num_workgroups) groups: vec3u) {
    let row = id.x + id.y * groups.x * 64u;
    if (row >= parameters[0]) { return; }
    kernelRow(row);
}
```

Calls nest as builtins do: `Vec3.scale(Vec3.normalize(Vec3.cross(p, v)), Vec3.dot(p, v))` emits
`cross_6 = cross(…)`, `normalize_19 = normalize(cross_6)`, `dot_26 = dot(…)` and `scale_31 = (normalize_19 * dot_26)`.

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
