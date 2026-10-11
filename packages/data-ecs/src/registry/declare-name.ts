const declared = new Map<string, "component" | "resource">();

/**
 * Claims a name for a component or resource.
 * Names are unique across both kinds because a resource may be stored as a component on a single entity.
 * A symbol is identified by its description, which persistence and replication use as its stable name,
 * so it must have one and it must not match another declared name.
 */
/** Whether a declared name is a component or a resource. */
export const kindOf = (name: string | symbol): "component" | "resource" | undefined =>
    declared.get(typeof name === "string" ? name : name.description ?? "");

export const declareName = (name: string | symbol, kind: "component" | "resource"): void => {
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
