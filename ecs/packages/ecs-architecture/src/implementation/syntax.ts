// © 2026 Adobe. MIT License. See /LICENSE for details.
import { parseSync, type ESTree } from 'vite';

export type Node = ESTree.Node;
export type Statement = ESTree.Program['body'][number];
export type Identifier = Extract<Node, { readonly type: 'Identifier' }>;

/** A module as the checks read it: its text, its ESTree program, and each node's children, in source order, and parent. */
export type Module = {
    readonly text: string;
    readonly program: ESTree.Program;
    readonly children: ReadonlyMap<Node, readonly Node[]>;
    readonly parents: ReadonlyMap<Node, Node>;
};

const isNode = (value: unknown): value is Node =>
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';

/** A file that doesn't parse is read as far as the parser recovers it, which may be not at all; the compiler reports its errors. */
export const parse = (path: string, text: string): Module => {
    const { program } = parseSync(path, text, { lang: 'ts' });
    const children = new Map<Node, Node[]>();
    const parents = new Map<Node, Node>();
    const visit = (node: Node): void => {
        const under: Node[] = [];
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                for (const item of value) if (isNode(item)) under.push(item);
            } else if (isNode(value)) under.push(value);
        }
        under.sort((a, b) => a.start - b.start);
        children.set(node, under);
        for (const child of under) {
            parents.set(child, node);
            visit(child);
        }
    };
    visit(program);
    return { text, program, children, parents };
};

/** Calls `visit` on `node`, the module's program unless given, and every node under it, depth first. */
export const walk = (module: Module, visit: (node: Node) => void, node: Node = module.program): void => {
    visit(node);
    for (const child of module.children.get(node) ?? []) walk(module, visit, child);
};

/** Where a node's text starts: at its first token, or at a decorator before its `export`. */
const startOf = (module: Module, node: Node): number => {
    const first = module.children.get(node)?.[0];
    return first === undefined ? node.start : Math.min(node.start, startOf(module, first));
};

/** A node's source text. */
export const textOf = (module: Module, node: Node): string => module.text.slice(startOf(module, node), node.end);

/** The first line of a node's text. */
export const firstLine = (module: Module, node: Node): string => textOf(module, node).split('\n')[0] ?? '';

/** The name an import or export specifier gives: `a` of `a` or `'a'`. */
export const nameOf = (name: ESTree.ModuleExportName): string => (name.type === 'Identifier' ? name.name : name.value);

type Pattern = ESTree.BindingPattern | ESTree.BindingRestElement | ESTree.ParamPattern | ESTree.TSIndexSignatureName;

/** The names a binding declares. */
export const bindingNames = (pattern: Pattern): string[] => {
    switch (pattern.type) {
        case 'Identifier': return [pattern.name];
        case 'ObjectPattern': return pattern.properties.flatMap(property => bindingNames(property.type === 'RestElement' ? property.argument : property.value));
        case 'ArrayPattern': return pattern.elements.flatMap(element => (element === null ? [] : bindingNames(element)));
        case 'AssignmentPattern': return bindingNames(pattern.left);
        case 'RestElement': return bindingNames(pattern.argument);
        case 'TSParameterProperty': return bindingNames(pattern.parameter);
    }
};

/** Whether a statement exports: a declaration, a list, a re-export or a default. */
export const isExport = (statement: Statement): boolean =>
    statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
    || statement.type === 'ExportAllDeclaration' || statement.type === 'TSExportAssignment';

/** Whether a statement re-exports from another module: `export * from`, `export { a } from`. */
export const isReExport = (statement: Node): statement is ESTree.ExportAllDeclaration | (ESTree.ExportNamedDeclaration & { readonly source: ESTree.StringLiteral }) =>
    statement.type === 'ExportAllDeclaration' || (statement.type === 'ExportNamedDeclaration' && statement.source !== null);

/** The declaration a statement makes: its own, or the one it exports. */
export const declarationOf = (statement: Statement): Statement => {
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration !== null) return statement.declaration;
    if (statement.type !== 'ExportDefaultDeclaration') return statement;
    const { declaration } = statement;
    return declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction' || declaration.type === 'ClassDeclaration'
        || declaration.type === 'TSInterfaceDeclaration' ? declaration : statement;
};

/** The variables a module exports with `export const`, `let` or `var`. */
export const exportedVariables = (module: Module): ESTree.VariableDeclaration[] =>
    module.program.body.flatMap(statement => {
        const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : null;
        return declaration?.type === 'VariableDeclaration' ? [declaration] : [];
    });

/** The names a declaration declares: of its variables, function, class, interface, type or enum. */
export const declaredBy = (statement: Statement): string[] => {
    switch (statement.type) {
        case 'VariableDeclaration': return statement.declarations.flatMap(declaration => bindingNames(declaration.id));
        case 'FunctionDeclaration': case 'TSDeclareFunction': case 'ClassDeclaration':
            return statement.id === null ? [] : [statement.id.name];
        case 'TSInterfaceDeclaration': case 'TSTypeAliasDeclaration': case 'TSEnumDeclaration': return [statement.id.name];
        default: return [];
    }
};

/** The names a module declares and exports, `default` for its default export; augmentations aren't exports. */
export const exportsOf = (module: Module): string[] => {
    const names: string[] = [];
    for (const statement of module.program.body) {
        if (statement.type === 'ExportDefaultDeclaration' || statement.type === 'TSExportAssignment') names.push('default');
        else if (statement.type !== 'ExportNamedDeclaration') continue;
        else if (statement.declaration !== null) names.push(...declaredBy(statement.declaration));
        else if (statement.source === null) for (const specifier of statement.specifiers) names.push(nameOf(specifier.exported));
    }
    return names;
};

/**
 * A module a file imports or re-exports from, with the names it takes, `default`, or `*` for a namespace with the
 * members read of it, and of those its `values`, the names it takes at runtime rather than as types.
 */
export type Import = { readonly spec: string; readonly typeOnly: boolean; readonly names: readonly string[]; readonly values: readonly string[] };

/** The members a module reads of a namespace it binds: `systems` of `view.systems`. */
const membersRead = (module: Module, namespace: string): string[] => {
    const names = new Set<string>();
    walk(module, node => {
        if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && node.object.name === namespace
            && node.property.type === 'Identifier' && !isLocal(module, node, namespace)) names.add(node.property.name);
    });
    return [...names];
};

/** Every module a file imports or re-exports from: static, dynamic, `import type` and `import('x')` types. */
export const importsOf = (module: Module): Import[] => {
    const imports: Import[] = [];
    walk(module, node => {
        if (node.type === 'ImportDeclaration') {
            const names: string[] = [];
            const values: string[] = [];
            let typeOnly = node.importKind === 'type';
            const named = node.specifiers.filter(specifier => specifier.type === 'ImportSpecifier');
            const hasDefault = node.specifiers.some(specifier => specifier.type === 'ImportDefaultSpecifier');
            const namespace = node.specifiers.find(specifier => specifier.type === 'ImportNamespaceSpecifier');
            if (hasDefault) names.push('default');
            if (namespace !== undefined) names.push('*', ...membersRead(module, namespace.local.name));
            else {
                for (const specifier of named) {
                    names.push(nameOf(specifier.imported));
                    if (specifier.importKind !== 'type') values.push(nameOf(specifier.imported));
                }
                if (!hasDefault && named.length > 0 && named.every(specifier => specifier.importKind === 'type')) typeOnly = true;
            }
            if (named.length === 0) values.push(...names);
            else if (hasDefault) values.push('default');
            imports.push({ spec: node.source.value, typeOnly, names, values: typeOnly ? [] : values });
        } else if (isReExport(node)) {
            const specifiers = node.type === 'ExportNamedDeclaration' ? node.specifiers : undefined;
            const names = specifiers?.map(specifier => nameOf(specifier.local)) ?? (node.type === 'ExportAllDeclaration' && node.exported !== null ? ['*'] : []);
            const typeOnly = node.exportKind === 'type' || (specifiers !== undefined && specifiers.length > 0 && specifiers.every(specifier => specifier.exportKind === 'type'));
            const values = specifiers?.filter(specifier => specifier.exportKind !== 'type').map(specifier => nameOf(specifier.local)) ?? names;
            imports.push({ spec: node.source.value, typeOnly, names, values: typeOnly ? [] : values });
        } else if (node.type === 'ImportExpression') {
            // What a dynamic import's namespace is used for isn't followed: it takes every name.
            if (node.source.type === 'Literal' && typeof node.source.value === 'string') imports.push({ spec: node.source.value, typeOnly: false, names: ['*'], values: ['*'] });
        } else if (node.type === 'TSImportType') {
            let qualifier = node.qualifier;
            while (qualifier !== null && qualifier.type === 'TSQualifiedName') qualifier = qualifier.left;
            imports.push({ spec: node.source.value, typeOnly: true, names: [qualifier === null ? '*' : qualifier.name], values: [] });
        }
    });
    return imports;
};

/** The names a module's top level binds: its imports and declarations. */
export const topLevelNames = (module: Module): Set<string> => {
    const names = new Set<string>();
    for (const statement of module.program.body) {
        if (statement.type === 'ImportDeclaration') for (const specifier of statement.specifiers) names.add(specifier.local.name);
        else for (const name of declaredIn(statement)) names.add(name);
    }
    return names;
};

/** The names a statement declares in the scope holding it. */
const declaredIn = (statement: Statement): string[] => {
    const declaration = declarationOf(statement);
    switch (declaration.type) {
        case 'VariableDeclaration': return declaration.declarations.flatMap(declarator => bindingNames(declarator.id));
        case 'FunctionDeclaration': case 'TSDeclareFunction': case 'ClassDeclaration': return declaration.id === null ? [] : [declaration.id.name];
        case 'TSEnumDeclaration': return [declaration.id.name];
        default: return [];
    }
};

/** The parameters a function, method, signature or function type binds, which a method's name is in the scope of too; none for any other node. */
const parametersOf = (node: Node): readonly Pattern[] => {
    switch (node.type) {
        case 'FunctionDeclaration': case 'FunctionExpression': case 'TSDeclareFunction': case 'TSEmptyBodyFunctionExpression': case 'ArrowFunctionExpression':
        case 'TSCallSignatureDeclaration': case 'TSConstructSignatureDeclaration': case 'TSMethodSignature': case 'TSFunctionType': case 'TSConstructorType':
            return node.params;
        case 'TSIndexSignature': return node.parameters;
        case 'MethodDefinition': case 'TSAbstractMethodDefinition': return node.value.params;
        default: return [];
    }
};

const functionLike = new Set<string>([
    'FunctionDeclaration', 'FunctionExpression', 'TSDeclareFunction', 'TSEmptyBodyFunctionExpression', 'ArrowFunctionExpression',
    'TSCallSignatureDeclaration', 'TSConstructSignatureDeclaration', 'TSMethodSignature', 'TSFunctionType', 'TSConstructorType', 'TSIndexSignature',
]);

/** The body whose `var`s a function or static block scopes. */
const varScopeOf = (node: Node): Node | undefined => {
    switch (node.type) {
        case 'FunctionDeclaration': case 'FunctionExpression': case 'TSDeclareFunction': case 'TSEmptyBodyFunctionExpression': case 'ArrowFunctionExpression':
            return node.body ?? undefined;
        case 'MethodDefinition': case 'TSAbstractMethodDefinition': return node.value.body ?? undefined;
        case 'StaticBlock': return node;
        default: return undefined;
    }
};

/** The names `var` declares anywhere under a function's or static block's body, but in the functions and static blocks nested in it. */
const varsIn = (module: Module, body: Node): string[] => {
    const names: string[] = [];
    const visit = (node: Node): void => {
        if (functionLike.has(node.type) || node.type === 'StaticBlock') return;
        if (node.type === 'VariableDeclaration' && node.kind === 'var') for (const declarator of node.declarations) names.push(...bindingNames(declarator.id));
        for (const child of module.children.get(node) ?? []) visit(child);
    };
    for (const child of module.children.get(body) ?? []) visit(child);
    return names;
};

/** The statements of a block, a module block, a switch case or a static block, whose declarations it scopes. */
const blockStatements = (node: Node): readonly Statement[] => {
    switch (node.type) {
        case 'BlockStatement': case 'TSModuleBlock': case 'StaticBlock': return node.body;
        case 'SwitchCase': return node.consequent;
        default: return [];
    }
};

/** The variables a `for`, `for in` or `for of` loop declares. */
const loopVariables = (node: Node): ESTree.VariableDeclaration | undefined => {
    const initializer = node.type === 'ForStatement' ? node.init : node.type === 'ForInStatement' || node.type === 'ForOfStatement' ? node.left : null;
    return initializer?.type === 'VariableDeclaration' ? initializer : undefined;
};

/** Whether `name`, used at `node`, is bound by a function, block or loop around it rather than by the module. */
export const isLocal = (module: Module, node: Node, name: string): boolean => {
    for (let scope = module.parents.get(node); scope !== undefined && scope.type !== 'Program'; scope = module.parents.get(scope)) {
        if (parametersOf(scope).some(parameter => bindingNames(parameter).includes(name))) return true;
        const body = varScopeOf(scope);
        if (body !== undefined && varsIn(module, body).includes(name)) return true;
        if ((scope.type === 'FunctionExpression' || scope.type === 'ClassExpression') && scope.id?.name === name) return true;
        if (blockStatements(scope).some(statement => declaredIn(statement).includes(name))) return true;
        if (loopVariables(scope)?.declarations.some(declarator => bindingNames(declarator.id).includes(name)) === true) return true;
        if (scope.type === 'CatchClause' && scope.param !== null && bindingNames(scope.param).includes(name)) return true;
    }
    return false;
};

/** Whether a part of a pattern declares names, as a variable's, a parameter's or a catch clause's does, rather than assigns them. */
const declaresNames = (module: Module, part: Node): boolean => {
    let holder = module.parents.get(part);
    while (holder !== undefined && (holder.type === 'ObjectPattern' || holder.type === 'ArrayPattern' || holder.type === 'RestElement'
        || holder.type === 'AssignmentPattern' || (holder.type === 'Property' && module.parents.get(holder)?.type === 'ObjectPattern'))) {
        part = holder;
        holder = module.parents.get(holder);
    }
    if (holder === undefined) return false;
    return (holder.type === 'VariableDeclarator' && holder.id === part) || holder.type === 'CatchClause' || holder.type === 'TSParameterProperty'
        || parametersOf(holder).some(parameter => parameter === part);
};

/** Whether an identifier names a declaration, a property or a member, so it reads no binding. */
export const namesOnly = (module: Module, node: Identifier): boolean => {
    const parent = module.parents.get(node);
    if (parent === undefined) return false;
    if (parametersOf(parent).some(parameter => parameter === node)) return true;
    switch (parent.type) {
        case 'MemberExpression': return !parent.computed && parent.property === node;
        case 'TSQualifiedName': return parent.right === node;
        case 'ImportSpecifier': case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier': case 'ExportSpecifier': return true;
        case 'MetaProperty': return parent.meta === node;
        case 'Property':
            if (parent.shorthand) return declaresNames(module, parent);
            return (parent.key === node && !parent.computed) || (parent.value === node && declaresNames(module, parent));
        case 'ArrayPattern': return declaresNames(module, parent);
        case 'RestElement': return declaresNames(module, parent);
        case 'AssignmentPattern': return parent.left === node && declaresNames(module, parent);
        case 'PropertyDefinition': case 'TSAbstractPropertyDefinition': case 'MethodDefinition': case 'TSAbstractMethodDefinition':
        case 'AccessorProperty': case 'TSAbstractAccessorProperty': case 'TSPropertySignature': case 'TSMethodSignature':
            return parent.key === node && !parent.computed;
        case 'VariableDeclarator': return parent.id === node;
        case 'TSParameterProperty': return parent.parameter === node;
        case 'CatchClause': return parent.param === node;
        case 'FunctionDeclaration': case 'FunctionExpression': case 'TSDeclareFunction': case 'ClassDeclaration': case 'ClassExpression':
        case 'TSTypeAliasDeclaration': case 'TSInterfaceDeclaration': case 'TSEnumDeclaration': case 'TSEnumMember':
            return parent.id === node;
        default: return false;
    }
};
