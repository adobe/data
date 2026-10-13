type Kind = "component" | "resource" | "trait";

const declared = new Map<string, Kind>();

/** Whether a declared name is a component, a resource or a trait. */
export const kindOf = (name: string | symbol): Kind | undefined =>
    declared.get(typeof name === "string" ? name : name.description ?? "");

/**
 * Claims a name for a component, resource or trait.
 * Names are unique across all three because a resource may be stored as a component on a single entity, and traits
 * may later be components of component entities.
 * A symbol is identified by its description, which persistence and replication use as its stable name,
 * so it must have one and it must not match another declared name.
 */
export const declareName = (name: string | symbol, kind: Kind): void => {
    const stableName = typeof name === "string" ? name : name.description;
    if (stableName === undefined) {
        throw new Error(`Cannot declare ${kind} ${String(name)}: a symbol name needs a description.`);
    }
    const existing = declared.get(stableName);
    if (existing !== undefined) {
        throw new Error(`Cannot declare ${kind} "${stableName}": already declared as a ${existing}.`);
    }
    declared.set(stableName, kind);
};
