// © 2026 Adobe. MIT License. See /LICENSE for details.
import ts from 'typescript';

/** A module as the checks read it: TypeScript's syntax tree, with parents set. */
export type Module = ts.SourceFile;

export const parse = (path: string, text: string): Module => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** Calls `visit` on `node` and every node under it, depth first. */
export const walk = (node: ts.Node, visit: (node: ts.Node) => void): void => {
    visit(node);
    ts.forEachChild(node, child => walk(child, visit));
};

/** The names a binding declares. */
export const bindingNames = (name: ts.BindingName): string[] => {
    if (ts.isIdentifier(name)) return [name.text];
    const names: string[] = [];
    for (const element of name.elements) if (ts.isBindingElement(element)) names.push(...bindingNames(element.name));
    return names;
};

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === kind);

export const isExported = (node: ts.Node): boolean => hasModifier(node, ts.SyntaxKind.ExportKeyword);

/** The names a module declares and exports, `default` for its default export; augmentations aren't exports. */
export const exportsOf = (module: Module): string[] => {
    const names: string[] = [];
    for (const statement of module.statements) {
        if (ts.isExportAssignment(statement)) names.push('default');
        else if (ts.isExportDeclaration(statement)) {
            if (statement.moduleSpecifier === undefined && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
                for (const element of statement.exportClause.elements) names.push(element.name.text);
            }
        } else if (!isExported(statement) || ts.isModuleDeclaration(statement)) continue;
        else if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) names.push(...bindingNames(declaration.name));
        } else if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) names.push('default');
        else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)
            || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) {
            if (statement.name !== undefined) names.push(statement.name.text);
        }
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
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === namespace && !isLocal(node, namespace)) names.add(node.name.text);
    });
    return [...names];
};

/** Every module a file imports or re-exports from: static, dynamic, `import type` and `import('x')` types. */
export const importsOf = (module: Module): Import[] => {
    const imports: Import[] = [];
    walk(module, node => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const clause = node.importClause;
            const names: string[] = [];
            const values: string[] = [];
            let typeOnly = clause?.isTypeOnly ?? false;
            if (clause?.name !== undefined) names.push('default');
            const bindings = clause?.namedBindings;
            if (bindings !== undefined && ts.isNamespaceImport(bindings)) names.push('*', ...membersRead(module, bindings.name.text));
            else if (bindings !== undefined) {
                for (const element of bindings.elements) {
                    names.push((element.propertyName ?? element.name).text);
                    if (!element.isTypeOnly) values.push((element.propertyName ?? element.name).text);
                }
                if (clause?.name === undefined && bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly)) typeOnly = true;
            }
            if (bindings === undefined || ts.isNamespaceImport(bindings)) values.push(...names);
            else if (clause?.name !== undefined) values.push('default');
            imports.push({ spec: node.moduleSpecifier.text, typeOnly, names, values: typeOnly ? [] : values });
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
            const clause = node.exportClause;
            const names = clause === undefined ? [] : ts.isNamedExports(clause) ? clause.elements.map(element => (element.propertyName ?? element.name).text) : ['*'];
            const typeOnly = node.isTypeOnly || (clause !== undefined && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every(element => element.isTypeOnly));
            const values = clause !== undefined && ts.isNamedExports(clause) ? clause.elements.filter(element => !element.isTypeOnly).map(element => (element.propertyName ?? element.name).text) : names;
            imports.push({ spec: node.moduleSpecifier.text, typeOnly, names, values: typeOnly ? [] : values });
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            // What a dynamic import's namespace is used for isn't followed: it takes every name.
            const [argument] = node.arguments;
            if (argument !== undefined && ts.isStringLiteral(argument)) imports.push({ spec: argument.text, typeOnly: false, names: ['*'], values: ['*'] });
        } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
            let qualifier = node.qualifier;
            while (qualifier !== undefined && ts.isQualifiedName(qualifier)) qualifier = qualifier.left;
            imports.push({ spec: node.argument.literal.text, typeOnly: true, names: [qualifier === undefined ? '*' : qualifier.text], values: [] });
        }
    });
    return imports;
};

/** The first line of a node's text. */
export const firstLine = (module: Module, node: ts.Node): string => node.getText(module).split('\n')[0] ?? '';

/** The names a module's top level binds: its imports and declarations. */
export const topLevelNames = (module: Module): Set<string> => {
    const names = new Set<string>();
    for (const statement of module.statements) {
        if (ts.isImportDeclaration(statement)) {
            const clause = statement.importClause;
            if (clause?.name !== undefined) names.add(clause.name.text);
            const bindings = clause?.namedBindings;
            if (bindings !== undefined && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
            else if (bindings !== undefined) for (const element of bindings.elements) names.add(element.name.text);
        } else for (const name of declaredIn(statement)) names.add(name);
    }
    return names;
};

/** The names a statement declares in the scope holding it. */
const declaredIn = (statement: ts.Node): string[] => {
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap(declaration => bindingNames(declaration.name));
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name !== undefined) return [statement.name.text];
    return [];
};

/** The names `var` declares anywhere in a function's or static block's body, but in the functions and static blocks nested in it. */
const varsIn = (body: ts.Node): string[] => {
    const names: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node)) return;
        if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0) {
            for (const declaration of node.declarations) names.push(...bindingNames(declaration.name));
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(body, visit);
    return names;
};

/** Whether `name`, used at `node`, is bound by a function, block or loop around it rather than by the module. */
export const isLocal = (node: ts.Node, name: string): boolean => {
    for (let scope = node.parent; !ts.isSourceFile(scope); scope = scope.parent) {
        if (ts.isFunctionLike(scope) && scope.parameters.some(parameter => bindingNames(parameter.name).includes(name))) return true;
        if ((ts.isFunctionLike(scope) || ts.isClassStaticBlockDeclaration(scope)) && 'body' in scope && scope.body !== undefined && varsIn(scope.body).includes(name)) return true;
        if ((ts.isFunctionExpression(scope) || ts.isClassExpression(scope)) && scope.name?.text === name) return true;
        if ((ts.isBlock(scope) || ts.isModuleBlock(scope) || ts.isCaseClause(scope) || ts.isDefaultClause(scope))
            && scope.statements.some(statement => declaredIn(statement).includes(name))) return true;
        if ((ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) && scope.initializer !== undefined
            && ts.isVariableDeclarationList(scope.initializer) && scope.initializer.declarations.some(declaration => bindingNames(declaration.name).includes(name))) return true;
        if (ts.isCatchClause(scope) && scope.variableDeclaration !== undefined && bindingNames(scope.variableDeclaration.name).includes(name)) return true;
    }
    return false;
};

/** Whether an identifier names a declaration, a property or a member, so it reads no binding. */
export const namesOnly = (node: ts.Identifier): boolean => {
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
    if (ts.isQualifiedName(parent)) return parent.right === node;
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return true;
    if (ts.isBindingElement(parent)) return parent.name === node || parent.propertyName === node;
    if (ts.isShorthandPropertyAssignment(parent)) return false;
    return (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)
        || ts.isMethodSignature(parent) || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent) || ts.isVariableDeclaration(parent)
        || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)
        || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isTypeAliasDeclaration(parent) || ts.isInterfaceDeclaration(parent)
        || ts.isEnumDeclaration(parent) || ts.isEnumMember(parent)) && parent.name === node;
};
