import type { Node, Program, SimpleCallExpression } from 'estree';
import { compileKernel } from './compile-kernel.js';
import { children, isFunction } from './estree.js';
import { fail, failureOf, type Failure } from './failure.js';
import { moduleScope } from './module-scope.js';
import { attachKernelPath } from './paths.js';
import { isKernel } from './signature.js';

export type Parse = (code: string) => Program;
/** Whether an import specifier, resolved from the module being transformed, is the package's `System` namespace. */
export type ResolveSystemImport = (source: string) => Promise<boolean>;
export type TransformResult = { readonly code: string } | { readonly failure: Failure };

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

const uniqueName = (code: string, base: string): string => {
    let name = base;
    for (let n = 1; code.includes(name); n++) name = `${base}${n}`;
    return name;
};

/**
 * Wraps each kernel `System.create(declaration, body)` call as `attachKernel(call, description)`.
 * Returns null when the module has no kernels, and a `Failure` when a kernel leaves the subset.
 */
export const transformKernels = async (code: string, id: string, parse: Parse, resolveSystemImport: ResolveSystemImport): Promise<TransformResult | null> => {
    if (!code.includes("kernel") || id.includes("\0")) return null;
    const program = parse(code);
    const locals = await systemLocals(program, resolveSystemImport);
    if (locals.size === 0) return null;
    const module = moduleScope(program);
    const attach = uniqueName(code, "attachKernel$");
    const edits: Edit[] = [];
    const visit = (node: Node, nested: boolean): void => {
        if (node.type === "CallExpression" && isSystemCreate(node, locals)) {
            const [declaration, body] = node.arguments;
            if (declaration?.type === "ObjectExpression" && isKernel(declaration)) {
                if (nested) fail(node, "kernel systems must be declared at module scope");
                if (body === undefined || body.type === "SpreadElement") return fail(node, "a kernel needs an inline body");
                const description = compileKernel(declaration, body, module);
                edits.push({ start: node.start, end: node.end, text: `${attach}(${code.slice(node.start, node.end)}, ${description})` });
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
    return { code: `import { attachKernel as ${attach} } from ${JSON.stringify(attachKernelPath)};\n${result}` };
};
