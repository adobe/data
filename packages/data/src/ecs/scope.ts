// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The schema flag pairs for the four scopes, spread into a component or resource
 * schema where it is declared, so each schema object is stamped once and shared by
 * identity:
 *
 * ```ts
 * export const displayCompleted = { ...Boolean.schema, ...Scope.settings } satisfies ResourceSchema;
 * ```
 *
 * - **document** — shared + durable: no flags (the default).
 * - **settings** — local + durable: `nonShared`.
 * - **presence** — shared + ephemeral: `nonPersistent`.
 * - **session** — local + ephemeral: both.
 *
 * On a component these flags scope the column. An entity's own quadrant comes from
 * the built-in `nonPersistent` / `nonShared` marker components in its archetype.
 */
export const Scope = {
    document: {},
    settings: { nonShared: true },
    presence: { nonPersistent: true },
    session: { nonPersistent: true, nonShared: true },
} as const;
