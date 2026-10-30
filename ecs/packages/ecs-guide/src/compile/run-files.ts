// © 2026 Adobe. MIT License. See /LICENSE for details.
import { runtimeKey, runtimeNames } from "../run/runtime-key.js";
import type { Exported } from "./messages.js";
import { guardModule } from "./protect.js";

/**
 * The files of one run, which the guide's service worker serves to its frame: the frame's page, whose import map gives
 * each package compiled code imports its exports module, and each compiled module, at its path in its package. Paths
 * are relative to the run's folder. The page's `#output` fills it, for a program to render into.
 */

/** The cache the compiler's worker puts runs' files in, which the service worker serves them from. */
export const runsCache = "ecs-guide-runs";
/** The folder of the service worker's scope runs are served from, named apart from the guide's own files. */
export const runsFolder = "ecs-guide-runs/";

/** Where the ECS is installed, whose compiler builds the examples and whose hooks compiled code imports. */
export const packageRoot = "/node_modules/@adobe/ecs";
/**
 * Where a package's examples are, as the compiler sees them: in its sources, where its guide's files are, so they
 * compile as its own tests do, and their keys' ids name it, as `18-identity.test.ts` checks.
 */
export const examplesFolderOf = (name: string): string => `/node_modules/${name}/src/guide`;
/** The modules compiled code imports hooks from, in the ECS's build. */
export const hookModules: readonly string[] = ["attach-kernel", "prepared-spawn", "prepared-lookup"].map(name => `${packageRoot}/dist/implementation/world/${name}.js`);

export type RunFile = { readonly path: string; readonly text: string; readonly type: string };

/** A package's exports module in a run: `package-0.js` for the first the run imports. */
const exportsOf = (at: number): string => `package-${at}.js`;

const page = (run: number, packages: readonly Exported[], modules: readonly string[]): string => {
    // Examples import their own package's sources' root as `../index.js`, which the compiler resolves in its sources.
    const imports = Object.fromEntries([
        ...[guardModule, ...hookModules].map(specifier => [specifier, "./exports.js"]),
        ...packages.flatMap(({ name }, at) => [[name, `./${exportsOf(at)}`], [`.${examplesFolderOf(name).replace(/\/guide$/, "/index.js")}`, `./${exportsOf(at)}`]]),
    ]);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Run ${run}</title>
<script type="importmap">${JSON.stringify({ imports })}</script>
<style>:root { color-scheme: light dark; } html, body { height: 100%; margin: 0; background: transparent; } body { font: 13px/1.4 system-ui, sans-serif; }
#output { position: relative; height: 100%; overflow: hidden; }</style>
</head>
<body>
<div id="output"></div>
<script type="module">import { start } from "./exports.js"; start(${run}, ${JSON.stringify(modules.map(module => `.${module}`))});</script>
</body>
</html>
`;
};

/** A module loading `runtime`, which puts its exports on the frame's global object, and re-exporting `names` of `from` there. */
const reexporting = (runtime: string, from: string, names: readonly string[]): string =>
    `import ${JSON.stringify(runtime)};\nconst runtime = globalThis[Symbol.for(${JSON.stringify(runtimeKey.description)})]${from};\nexport const { ${names.join(", ")} } = runtime;\n`;

/**
 * A run's files: its page; its exports modules, which load `runtime` and re-export the runtime's own names, and each
 * of `packages`' names; and its modules, by their paths in their package, with their compiled code.
 */
export const runFiles = (run: number, runtime: string, packages: readonly Exported[], modules: readonly { readonly path: string; readonly code: string }[]): readonly RunFile[] => [
    { path: "index.html", text: page(run, packages, modules.map(module => module.path)), type: "text/html" },
    { path: "exports.js", text: reexporting(runtime, "", runtimeNames), type: "text/javascript" },
    ...packages.map(({ name, names }, at) => ({ path: exportsOf(at), text: reexporting(runtime, `.packages[${JSON.stringify(name)}]`, names), type: "text/javascript" })),
    ...modules.map(module => ({ path: module.path.slice(1), text: module.code, type: "text/javascript" })),
];
