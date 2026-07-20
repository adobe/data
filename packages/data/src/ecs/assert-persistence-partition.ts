// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ComponentSchemas } from "./component-schemas.js";
import type { ResourceSchemas } from "./resource-schemas.js";

type FeatureSchema = {
    readonly components: ComponentSchemas;
    readonly resources: ResourceSchemas;
};

const facetViolations = (
    facet: "component" | "resource",
    persistent: ComponentSchemas | ResourceSchemas | undefined,
    session: ComponentSchemas | ResourceSchemas | undefined,
): string[] => {
    const out: string[] = [];
    const persistentKeys = new Set(Object.keys(persistent ?? {}));
    for (const [name, schema] of Object.entries(persistent ?? {})) {
        if (schema.nonPersistent === true) {
            out.push(
                `persistent ${facet} "${name}" is marked nonPersistent — it belongs in the session database`,
            );
        }
    }
    for (const [name, schema] of Object.entries(session ?? {})) {
        if (persistentKeys.has(name)) continue; // inherited persistent facet
        if (schema.nonPersistent !== true) {
            out.push(
                `session ${facet} "${name}" is missing \`nonPersistent: true\` — mark it, or move it to the persistent database`,
            );
        }
    }
    return out;
};

/**
 * Verifies a feature's persistent/session schema split. Given the feature's
 * persistent-database plugin and its session-database plugin (which extends the
 * persistent one), it asserts two invariants:
 *
 * - every component/resource in the persistent plugin is serializable — none is
 *   marked `nonPersistent`;
 * - every component/resource the session plugin *adds* on top is marked
 *   `nonPersistent: true`.
 *
 * Throws an `Error` listing every violation. Intended as a per-feature unit
 * test so the persistent data model — the durable, human-facing schema — stays
 * cleanly separated from transient session state, and neither drifts.
 */
export function assertPersistencePartition(
    persistent: FeatureSchema,
    session: FeatureSchema,
): void {
    const violations = [
        ...facetViolations("component", persistent.components, session.components),
        ...facetViolations("resource", persistent.resources, session.resources),
    ];
    if (violations.length > 0) {
        throw new Error(
            `Persistence partition violations:\n  ${violations.join("\n  ")}`,
        );
    }
}
