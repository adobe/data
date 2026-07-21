// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ComponentSchemas } from "./component-schemas.js";
import type { ResourceSchemas } from "./resource-schemas.js";

type FeatureSchema = {
    readonly components: ComponentSchemas;
    readonly resources: ResourceSchemas;
};

// The four schema scopes and the (nonShared, nonPersistent) flag pair each
// requires. document = shared + durable; settings = local + durable; presence =
// shared + ephemeral; session = local + ephemeral.
const SCOPES = {
    document: { nonPersistent: false, nonShared: false },
    settings: { nonPersistent: false, nonShared: true },
    presence: { nonPersistent: true, nonShared: false },
    session: { nonPersistent: true, nonShared: true },
} as const;

type Scope = keyof typeof SCOPES;

// Canonical layering order (each layer extends the previous present one, so its
// facet maps are supersets — new keys are what that layer adds).
const ORDER: readonly Scope[] = ["document", "settings", "presence", "session"];

// Built-in components present on every store; not owned by any feature scope.
const BUILTINS = new Set(["id", "nonPersistent", "nonShared"]);

/**
 * Verifies a feature's schema-scope split. Pass the plugins for whichever
 * scopes the feature defines (each extends the previous one it has). For every
 * component/resource a scope layer *adds*, it must carry exactly that scope's
 * flag pair — so a durable-local `settings` value declares `nonShared: true`
 * (not `nonPersistent`), a `session` value declares both, and `document`
 * declares neither. Throws with every violation listed.
 *
 * A per-feature unit test so the durable/local/shared/ephemeral scope of every
 * piece of state stays explicit and can't drift. The database does not yet act
 * on these flags (see the `nonShared` schema note); this keeps the modelling
 * honest ahead of that.
 */
export function assertSchemaScopes(layers: Partial<Record<Scope, FeatureSchema>>): void {
    const violations: string[] = [];
    let prev: FeatureSchema | undefined;

    for (const scope of ORDER) {
        const layer = layers[scope];
        if (!layer) continue;
        const expected = SCOPES[scope];

        const check = (
            facet: "component" | "resource",
            map: ComponentSchemas | ResourceSchemas,
            prevMap: ComponentSchemas | ResourceSchemas | undefined,
        ): void => {
            const inherited = new Set(Object.keys(prevMap ?? {}));
            for (const [name, schema] of Object.entries(map)) {
                if (BUILTINS.has(name) || inherited.has(name)) continue;
                const nonPersistent = schema.nonPersistent === true;
                const nonShared = schema.nonShared === true;
                if (nonPersistent !== expected.nonPersistent || nonShared !== expected.nonShared) {
                    violations.push(
                        `${scope} ${facet} "${name}" is {nonShared:${nonShared}, nonPersistent:${nonPersistent}}, ` +
                        `expected {nonShared:${expected.nonShared}, nonPersistent:${expected.nonPersistent}}`,
                    );
                }
            }
        };

        check("component", layer.components, prev?.components);
        check("resource", layer.resources, prev?.resources);
        prev = layer;
    }

    if (violations.length > 0) {
        throw new Error(`Schema scope violations:\n  ${violations.join("\n  ")}`);
    }
}
