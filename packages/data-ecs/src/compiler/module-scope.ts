import type { Expression, FunctionDeclaration, Pattern, Program, Statement, ModuleDeclaration, Directive } from 'estree';

/** A module-scope binding. Only `const` initializers and function declarations can be inlined into kernels. */
export type ModuleBinding =
    | { readonly kind: "const"; readonly init: Expression }
    | { readonly kind: "function"; readonly node: FunctionDeclaration }
    | { readonly kind: "import" }
    | { readonly kind: "other" };

export type ModuleScope = ReadonlyMap<string, ModuleBinding>;

const patternNames = (pattern: Pattern): readonly string[] => {
    switch (pattern.type) {
        case "Identifier": return [pattern.name];
        case "ArrayPattern": return pattern.elements.flatMap(element => element === null ? [] : patternNames(element));
        case "ObjectPattern": return pattern.properties.flatMap(property =>
            patternNames(property.type === "RestElement" ? property.argument : property.value));
        case "RestElement": return patternNames(pattern.argument);
        case "AssignmentPattern": return patternNames(pattern.left);
        case "MemberExpression": return [];
    }
};

const declare = (scope: Map<string, ModuleBinding>, statement: Statement | ModuleDeclaration | Directive): void => {
    switch (statement.type) {
        case "ImportDeclaration":
            for (const specifier of statement.specifiers) scope.set(specifier.local.name, { kind: "import" });
            return;
        case "ExportNamedDeclaration":
            if (statement.declaration) declare(scope, statement.declaration);
            return;
        case "VariableDeclaration":
            for (const declarator of statement.declarations) {
                if (statement.kind === "const" && declarator.id.type === "Identifier" && declarator.init) {
                    scope.set(declarator.id.name, { kind: "const", init: declarator.init });
                } else {
                    for (const name of patternNames(declarator.id)) scope.set(name, { kind: "other" });
                }
            }
            return;
        case "FunctionDeclaration":
            if (statement.id) scope.set(statement.id.name, { kind: "function", node: statement });
            return;
        case "ClassDeclaration":
            if (statement.id) scope.set(statement.id.name, { kind: "other" });
            return;
        default:
            return;
    }
};

/** Collects the bindings declared at the top level of `program`. */
export const moduleScope = (program: Program): ModuleScope => {
    const scope = new Map<string, ModuleBinding>();
    for (const statement of program.body) declare(scope, statement);
    return scope;
};
