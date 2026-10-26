// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from "vitest";
import { parseAst } from "vite";
import type { ObjectExpression } from "estree";
import { estreeOf } from "./estree.js";
import { resolvedDeclaration } from "./inferred.js";

/** The declaration written as `source`, an object literal. */
const declarationOf = (source: string): ObjectExpression => {
    const statement = estreeOf(parseAst(`(${source});`)).body[0];
    if (statement?.type !== "ExpressionStatement" || statement.expression.type !== "ObjectExpression") throw new Error("not an object literal");
    return statement.expression;
};

/** The names a resolved declaration's lookup `name` reads, or null without a `read` list. */
const readOf = (declaration: ObjectExpression, name: string): readonly string[] | null => {
    const field = (object: ObjectExpression, key: string) => object.properties.find(property =>
        property.type === "Property" && property.key.type === "Identifier" && property.key.name === key);
    const lookup = field(declaration, "lookup");
    const entry = lookup?.type === "Property" && lookup.value.type === "ObjectExpression" ? field(lookup.value, name) : undefined;
    const read = entry?.type === "Property" && entry.value.type === "ObjectExpression" ? field(entry.value, "read") : undefined;
    if (read?.type !== "Property" || read.value.type !== "ArrayExpression") return null;
    return read.value.elements.map(element => element?.type === "Identifier" ? element.name : "?");
};

describe("resolvedDeclaration", () => {
    test("takes a lookup by entity whose rows the build didn't follow as reading all it requires", () => {
        const declaration = declarationOf("{ lookup: { targets: { with: [mass, position] } } }");
        const resolved = resolvedDeclaration(declaration, { query: null, resources: null, lookups: new Map([["targets", null]]), up: null });
        expect(readOf(resolved, "targets")).toEqual(["mass", "position"]);
    });
});
