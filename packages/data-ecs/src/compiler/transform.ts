import type { Node, Program, SimpleCallExpression } from 'estree';
import { compileKernel } from './compile-kernel.js';
import { children, isFunction } from './estree.js';
import { fail, failureOf, type Failure } from './failure.js';
import type { Builtins } from './builtins.js';
import { moduleScope, type ModuleBinding } from './module-scope.js';
import { attachKernelPath, prepareSpawnPath } from './paths.js';
import { spawnSites } from './spawns.js';
import { kernelOf } from './signature.js';

export type Parse = (code: string) => Program;
/** Whether an import specifier, resolved from the module being transformed, is the package's `System` namespace. */
export type ResolveSystemImport = (source: string) => Promise<boolean>;
/**
 * The JS expression for kernel `index`'s module url. `identity` is everything the description and module are
 * compiled to (the description without its url, plus the module source), so it can version the url.
 */
export type KernelUrl = (index: number, identity: string) => string;
/**
 * How kernels reach the package's math types: `fileOf` is the math module an import specifier names (the math
 * index for the package root), or null; `builtins` loads them all, once.
 */
export type MathImports = { readonly fileOf: (source: string) => Promise<string | null>; readonly builtins: () => Promise<Builtins> };
/** `kernels[i]` is the source of kernel `i`'s module, which exports `create`. */
export type TransformResult = { readonly code: string; readonly kernels: readonly string[] } | { readonly failure: Failure };

type Edit = { readonly start: number; readonly end: number; readonly text: string };

const systemLocals = async (program: Program, resolveSystemImport: ResolveSystemImport): Promise<ReadonlySet<string>> => {
    const locals = new Set<string>();
    for (const statement of program.body) {
        if (statement.type !== "ImportDeclaration" || typeof statement.source.value !== "string") continue;
        const specifiers = statement.specifiers.filter(specifier => specifier.type === "ImportSpecifier"
            && specifier.imported.type === "Identifier" && specifier.imported.name === "System");
        if (specifiers.length > 0 && await resolveSystemImport(statement.source.value)) {
            for (const specifier of specifiers) locals.add(specifier.local.name);
        }
    }
    return locals;
};

const isSystemCreate = (node: SimpleCallExpression, locals: ReadonlySet<string>): boolean =>
    node.callee.type === "MemberExpression" && !node.callee.computed
    && node.callee.object.type === "Identifier" && locals.has(node.callee.object.name)
    && node.callee.property.type === "Identifier" && node.callee.property.name === "create";

/**
 * A spawn site's function: one parameter per value, so values pass without an array, then each written straight
 * into the batch row by the site's own writers (`PreparedSpawn` in `world/create/prepared-spawn.ts`).
 */
const spawnFunction = (name: string, prepare: string, keys: readonly string[]): string => {
    const values = keys.map((_, k) => `v${k}`);
    const writes = values.map((value, k) => `w[${k}](r, ${value})`);
    return [
        `const ${name} = (() => {`,
        `const p = ${prepare}(() => [${keys.join(", ")}]);`,
        `return (c, ${values.join(", ")}) => {`,
        "const r = p.begin(c);",
        "const w = p.writers;",
        `return ${["r >= 0", ...writes].join(" && ")} ? p.end() : p.fallback(c, [${values.join(", ")}]);`,
        "};",
        "})();",
    ].join("\n");
};

const uniqueName = (code: string, base: string): string => {
    let name = base;
    for (let n = 1; code.includes(name); n++) name = `${base}${n}`;
    return name;
};

/**
 * Wraps each kernel `System.create(declaration, body)` call as `attachKernel(call, description)`, and returns each
 * kernel's `create` as its own module, referenced by `description.url`.
 * Also passes the values of main-thread spawns of literal keys positionally (`spawns.ts`).
 * Returns null when the module has neither, and a `Failure` when a kernel leaves the subset.
 */
/** The module scope with imports of math types bound to them, and the loaded math modules if any are imported. */
const withMath = async (program: Program, math: MathImports | undefined): Promise<{ readonly scope: Map<string, ModuleBinding>; readonly builtins: Builtins | null }> => {
    const scope = new Map(moduleScope(program));
    let builtins: Builtins | null = null;
    if (math === undefined) return { scope, builtins };
    for (const statement of program.body) {
        if (statement.type !== "ImportDeclaration" || typeof statement.source.value !== "string") continue;
        const file = await math.fileOf(statement.source.value);
        if (file === null) continue;
        builtins ??= await math.builtins();
        for (const specifier of statement.specifiers) {
            if (specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier") {
                scope.set(specifier.local.name, { kind: "builtin", target: { kind: "export", file, name: specifier.imported.name } });
            }
            else if (specifier.type === "ImportNamespaceSpecifier") scope.set(specifier.local.name, { kind: "builtin", target: { kind: "namespace", file } });
        }
    }
    return { scope, builtins };
};

export const transformKernels = async (
    code: string, id: string, parse: Parse, resolveSystemImport: ResolveSystemImport, kernelUrl: KernelUrl, math?: MathImports,
): Promise<TransformResult | null> => {
    if ((!code.includes("kernel") && !code.includes("spawn")) || id.includes("\0")) return null;
    const program = parse(code);
    const locals = await systemLocals(program, resolveSystemImport);
    if (locals.size === 0) return null;
    const { scope: module, builtins } = await withMath(program, code.includes("kernel") ? math : undefined);
    const attach = uniqueName(code, "attachKernel$");
    const prepare = uniqueName(code, "prepareSpawn$");
    const spawnName = uniqueName(code, "spawn$");
    const edits: Edit[] = [];
    const kernels: string[] = [];
    /** Module-scope declarations of prepared spawns, appended after everything they name is declared. */
    const prepared: string[] = [];
    const visit = (node: Node, nested: boolean): void => {
        if (node.type === "CallExpression" && isSystemCreate(node, locals)) {
            const [declaration, body] = node.arguments;
            const target = declaration?.type === "ObjectExpression" ? kernelOf(declaration) : null;
            if (declaration?.type === "ObjectExpression" && target !== null) {
                if (nested) fail(node, "kernel systems must be declared at module scope");
                if (body === undefined || body.type === "SpreadElement") return fail(node, "a kernel needs an inline body");
                const compiled = compileKernel(declaration, body, module, target, builtins);
                const source = `export const create = ${compiled.create};\n`;
                const description = compiled.description(kernelUrl(kernels.length, `${compiled.description("")}\n${source}`));
                kernels.push(source);
                edits.push({ start: node.start, end: node.end, text: `${attach}(${code.slice(node.start, node.end)}, ${description})` });
                return;
            }
            const spawns = body === undefined || body.type === "SpreadElement" ? null : spawnSites(body, module);
            if (spawns !== null && spawns.sites.length > 0) {
                for (const site of spawns.sites) {
                    const name = `${spawnName}${prepared.length}`;
                    prepared.push(spawnFunction(name, prepare, site.keys));
                    const values = site.values.map(value => code.slice(value.start, value.end));
                    edits.push({ start: site.start, end: site.end, text: `${name}(${[spawns.commands, ...values].join(", ")})` });
                }
                return;
            }
        }
        const inner = nested || isFunction(node);
        for (const child of children(node)) visit(child, inner);
    };
    try {
        visit(program, false);
    } catch (error) {
        const failure = failureOf(error);
        if (failure === undefined) throw error;
        return { failure };
    }
    if (edits.length === 0) return null;
    let result = code;
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    const imports = [
        ...kernels.length > 0 ? [`import { attachKernel as ${attach} } from ${JSON.stringify(attachKernelPath)};`] : [],
        ...prepared.length > 0 ? [`import { prepareSpawn as ${prepare} } from ${JSON.stringify(prepareSpawnPath)};`] : [],
    ];
    return { code: [...imports, result, ...prepared].join("\n"), kernels };
};
