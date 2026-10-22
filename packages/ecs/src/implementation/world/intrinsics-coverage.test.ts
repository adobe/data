/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const directory = fileURLToPath(new URL("../../interface/math/", import.meta.url));
const filesIn = (path: string): string[] => readdirSync(path, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? filesIn(join(path, entry.name)) : entry.name.endsWith(".ts") && !entry.name.includes("test") ? [join(path, entry.name)] : []);

/** A math file's function as kernels call it: `vec3/i32/add.ts` is `Vec3.I32.add`, `vec3/f32/add.ts` is `Vec3.add`. */
const calledAs = (file: string): string => {
    const [first = "", ...rest] = relative(directory, file).replace(/\.ts$/, "").split("/");
    const namespace = first === "mat4x4" ? "Mat4x4" : first.charAt(0).toUpperCase() + first.slice(1);
    const name = (rest.pop() ?? "").replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
    const kind = rest[0] === "i32" || rest[0] === "u32" ? [rest[0].toUpperCase()] : [];
    return [namespace, ...kind, name].join(".");
};

test("every function that declares a WGSL builtin is compared with it on the GPU", () => {
    const declared = filesIn(directory).filter(file => readFileSync(file, "utf8").includes("intrinsic({")).map(calledAs);
    const tested = readFileSync(fileURLToPath(new URL("./intrinsics.browser.test.ts", import.meta.url)), "utf8");
    expect(declared.length).toBeGreaterThan(200);
    expect(declared.filter(name => !tested.includes(`= ${name}(`))).toEqual([]);
});
