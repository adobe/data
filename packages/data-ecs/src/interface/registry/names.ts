/** What a declared name names. */
export type Kind = "component" | "resource" | "trait";

const declared = new Map<string, Kind>();

/** A symbol's stable name is its description, which persistence and replication use. */
const stableNameOf = (name: string | symbol): string | undefined => typeof name === "string" ? name : name.description;

/** Whether a declared name is a component, a resource or a trait. */
export const kindOf = (name: string | symbol): Kind | undefined => {
    const stableName = stableNameOf(name);
    return stableName === undefined ? undefined : declared.get(stableName);
};

/**
 * Claims a name for a component, resource or trait. Names are unique across all three, since a resource may be stored
 * as a component on a single entity. Throws for a name already claimed, or a symbol without a description.
 */
export const declareName = (name: string | symbol, kind: Kind): void => {
    const stableName = stableNameOf(name);
    if (stableName === undefined) throw new Error(`Cannot declare ${kind} ${String(name)}: a symbol name needs a description.`);
    const existing = declared.get(stableName);
    if (existing !== undefined) throw new Error(`Cannot declare ${kind} "${stableName}": already declared as a ${existing}.`);
    declared.set(stableName, kind);
};
