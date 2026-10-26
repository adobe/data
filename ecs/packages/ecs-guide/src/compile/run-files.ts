// © 2026 Adobe. MIT License. See /LICENSE for details.
import { runtimeKey } from "../run/runtime-key.js";
import { guardModule } from "./protect.js";

/**
 * The files of one run, which the guide's service worker serves to its frame: the frame's page, whose import map gives
 * every specifier compiled code imports from the package one exports module, and each compiled module, at its path in
 * the package. Paths are relative to the run's folder. The page's `#output` fills it, for a program to render into.
 */

/** The cache the compiler's worker puts runs' files in, which the service worker serves them from. */
export const runsCache = "ecs-guide-runs";
/** The folder of the service worker's scope runs are served from, named apart from the guide's own files. */
export const runsFolder = "ecs-guide-runs/";

/** Where the package is installed. */
export const packageRoot = "/node_modules/@adobe/ecs";
/**
 * Where the examples' modules are, as the compiler sees them: in the package's sources, where the guide's files are,
 * so they compile as the package's own tests do, and their keys' ids name the package, as `18-identity.test.ts` checks.
 */
export const examplesFolder = `${packageRoot}/src/guide`;
/** The modules compiled code imports hooks from, in the package's build. */
export const hookModules: readonly string[] = ["attach-kernel", "prepared-spawn", "prepared-lookup"].map(name => `${packageRoot}/dist/implementation/world/${name}.js`);
/** What the examples import the package as: its sources' root module, as the build resolves `../index.js` there. */
const examplesIndex = `${packageRoot}/src/index.js`;

export type RunFile = { readonly path: string; readonly text: string; readonly type: string };

const page = (run: number, modules: readonly string[]): string => {
    const imports = Object.fromEntries(["@adobe/ecs", guardModule, ...hookModules, `.${examplesIndex}`].map(specifier => [specifier, "./exports.js"]));
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

/**
 * A run's files: its page, its exports module, which loads `runtime` and re-exports `names` from it, and its modules,
 * by their paths in the package, with their compiled code.
 */
export const runFiles = (run: number, runtime: string, names: readonly string[], modules: readonly { readonly path: string; readonly code: string }[]): readonly RunFile[] => [
    { path: "index.html", text: page(run, modules.map(module => module.path)), type: "text/html" },
    {
        path: "exports.js",
        text: `import ${JSON.stringify(runtime)};\nconst runtime = globalThis[Symbol.for(${JSON.stringify(runtimeKey.description)})];\nexport const { ${names.join(", ")} } = runtime;\n`,
        type: "text/javascript",
    },
    ...modules.map(module => ({ path: module.path.slice(1), text: module.code, type: "text/javascript" })),
];
