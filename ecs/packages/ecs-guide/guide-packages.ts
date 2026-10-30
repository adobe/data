// © 2026 Adobe. MIT License. See /LICENSE for details.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { filesOf, shippedBy } from "./src/compile/shipped.ts";

/**
 * A package with a guide section: one of this guide's dependencies whose package.json has a `guide` field. Its
 * chapters are in its `src/guide`, listed by its `README.md` there; `guide.files` are the patterns, as in `files`, of
 * what the guide's compiler and checker read of it, of what it ships.
 */
type Found = {
    readonly name: string; readonly folder: string; readonly manifest: string; readonly patterns: readonly string[];
    readonly dependencies: readonly string[];
    /** The module its root export imports, as every module importing the package by name resolves it, so a bundle holds one copy. */
    readonly entry: string;
};

/** What a package.json's `exports` give its root, under the `import` condition, as a path in the package. */
const entryOf = (manifest: unknown): string => {
    const exports: unknown = typeof manifest === "object" && manifest !== null ? Reflect.get(manifest, "exports") : undefined;
    const root: unknown = typeof exports === "string" ? exports : typeof exports === "object" && exports !== null ? Reflect.get(exports, ".") : undefined;
    const target: unknown = typeof root === "object" && root !== null ? Reflect.get(root, "import") ?? Reflect.get(root, "default") : root;
    return typeof target === "string" ? target : "./index.js";
};

const manifestOf = (text: string): { readonly name?: unknown; readonly guide?: unknown; readonly dependencies?: unknown } => {
    const json: unknown = JSON.parse(text);
    return typeof json === "object" && json !== null ? json : {};
};

const namesOf = (value: unknown): readonly string[] => typeof value === "object" && value !== null ? Object.keys(value) : [];

/** The guide's packages, each after those it depends on, and by name where neither depends on the other. */
const packagesOf = (guide: string): readonly Found[] => {
    const own = manifestOf(readFileSync(join(guide, "package.json"), "utf8"));
    const found: Found[] = [];
    for (const name of namesOf(own.dependencies)) {
        const installed = join(guide, "node_modules", name, "package.json");
        if (!existsSync(installed)) continue;
        const manifestPath = realpathSync(installed);
        const manifest = readFileSync(manifestPath, "utf8");
        const declared = manifestOf(manifest).guide;
        if (typeof declared !== "object" || declared === null) continue;
        const patterns: unknown = Reflect.get(declared, "files");
        found.push({
            name, folder: dirname(manifestPath), manifest, entry: join(dirname(manifestPath), entryOf(JSON.parse(manifest))),
            patterns: Array.isArray(patterns) ? patterns.filter(pattern => typeof pattern === "string") : [],
            dependencies: namesOf(manifestOf(manifest).dependencies),
        });
    }
    const ordered: Found[] = [];
    const remaining = [...found].sort((a, b) => a.name.localeCompare(b.name));
    while (remaining.length > 0) {
        const next = remaining.findIndex(item => item.dependencies.every(dependency => !remaining.some(other => other.name === dependency)));
        ordered.push(...remaining.splice(next < 0 ? 0 : next, 1));
    }
    return ordered;
};

/** Every file below `folder`, by its path there, but those in `node_modules`. */
const filesBelow = (folder: string): readonly string[] => readdirSync(folder, { recursive: true, encoding: "utf8" })
    .map(path => path.replace(/\\/g, "/"))
    .filter(path => !path.split("/").includes("node_modules") && statSync(join(folder, path)).isFile());

const named = (folder: string, names: readonly string[]) => names.map(name => ({ name, source: readFileSync(join(folder, name), "utf8") }));

/** What `virtual:guide-packages` gives for a package: its chapters' files and the files its compiler and checker read. */
const contentOf = (found: Found, watch: (file: string) => void) => {
    const chapters = join(found.folder, "src", "guide");
    if (!existsSync(join(chapters, "README.md"))) throw new Error(`${found.name} declares a guide in its package.json, so its chapters are in src/guide, listed by src/guide/README.md.`);
    const inGuide = readdirSync(chapters).filter(name => statSync(join(chapters, name)).isFile()).sort();
    const shipped = shippedBy(filesOf(found.manifest));
    const read = shippedBy(found.patterns);
    const below = filesBelow(found.folder).filter(shipped).sort();
    const files = below.filter(read);
    const declarations = below.filter(path => path.startsWith("dist/") && path.endsWith(".d.ts"));
    for (const name of inGuide) watch(join(chapters, name));
    return {
        name: found.name,
        index: readFileSync(join(chapters, "README.md"), "utf8"),
        prose: named(chapters, inGuide.filter(name => /^\d+-[\w-]+\.md$/.test(name))),
        sources: named(chapters, inGuide.filter(name => /^\d+-[\w-]+\.(?:type-test\.)?ts$/.test(name))),
        outputs: named(chapters, inGuide.filter(name => /^\d+-[\w-]+\.out$/.test(name))),
        files: [["package.json", found.manifest], ...files.map(path => [path, readFileSync(join(found.folder, path), "utf8")])],
        declarations: [["package.json", found.manifest], ...declarations.map(path => [path, readFileSync(join(found.folder, path), "utf8")])],
    };
};

const content = "virtual:guide-packages";
const runtime = "virtual:guide-runtime";

/**
 * The guide's packages as two modules: `virtual:guide-packages`, each package's name, chapters, the files its compiler
 * reads and the declarations its checker reads, in the guide's order; and `virtual:guide-runtime`, each package's exports by its name, as
 * a run's frame imports them. A build of one of them, or a change to its sources, reloads no page: its modules are
 * only invalidated, so the next load reads them anew, since a build writes many files and each would reload the page
 * otherwise, losing what the reader typed.
 */
export const guidePackages = (guide: string): Plugin => {
    const found = packagesOf(guide);
    const folders = found.flatMap(item => ["dist", "src"].map(folder => `${join(item.folder, folder).replace(/\\/g, "/")}/`));
    return {
        name: "guide-packages",
        resolveId: id => id === content || id === runtime ? `\0${id}` : null,
        load(id) {
            if (id === `\0${content}`) return `export const packages = ${JSON.stringify(found.map(item => contentOf(item, file => this.addWatchFile(file))))};`;
            if (id === `\0${runtime}`) {
                const imports = found.map((item, at) => `import * as package${at} from ${JSON.stringify(item.entry.replace(/\\/g, "/"))};`);
                return `${imports.join("\n")}\nexport const modules = { ${found.map((item, at) => `${JSON.stringify(item.name)}: package${at}`).join(", ")} };\n`;
            }
            return null;
        },
        hotUpdate({ file, modules }) {
            const path = file.replace(/\\/g, "/");
            if (!folders.some(folder => path.startsWith(folder))) return;
            for (const module of modules) this.environment.moduleGraph.invalidateModule(module);
            const loaded = this.environment.moduleGraph.getModuleById(`\0${content}`);
            if (loaded !== undefined) this.environment.moduleGraph.invalidateModule(loaded);
            return [];
        },
    };
};
