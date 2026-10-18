/**
 * The `Symbol.for` name of the global `WeakSet` of system bodies the plugin proved never reach their context's
 * `commands`. Its version changes with the set's format.
 */
export const terminalBodiesName = "@adobe/data-ecs/terminal@1";

const terminalBodies = Symbol.for(terminalBodiesName);

/** Whether the plugin proved a system's body never reaches its context's `commands`. */
export const provenTerminal = (body: unknown): boolean => {
    const set: unknown = Reflect.get(globalThis, terminalBodies);
    return set instanceof WeakSet && typeof body === "function" && set.has(body);
};
