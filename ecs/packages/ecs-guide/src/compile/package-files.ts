// © 2026 Adobe. MIT License. See /LICENSE for details.
import { packageRoot } from "./run-files.js";
import { filesOf, shippedBy } from "./shipped.js";

/**
 * The package as the compiler reads it, installed at `packageRoot`: its manifest, and of the files it ships, as its
 * `files` say, its sources' root and interface, which the build reads types and the examples' imports from, and its
 * build's, which kernels inline from. Read from `../ecs` as the guide builds.
 */
const manifest: { readonly [path: string]: string } = import.meta.glob("../../../ecs/package.json", { query: "?raw", import: "default", eager: true });
const sources: { readonly [path: string]: string } = import.meta.glob(
    ["../../../ecs/src/index.ts", "../../../ecs/src/interface/**/*.ts", "../../../ecs/dist/index.js", "../../../ecs/dist/interface/**/*.js"],
    { query: "?raw", import: "default", eager: true },
);

const shipped = shippedBy(filesOf(Object.values(manifest)[0] ?? "{}"));

export const packageFiles: ReadonlyMap<string, string> = new Map(Object.entries({ ...manifest, ...sources })
    .map(([path, text]): [string, string] => [path.slice("../../../ecs/".length), text])
    .filter(([path]) => path === "package.json" || shipped(path))
    .map(([path, text]) => [`${packageRoot}/${path}`, text]));
