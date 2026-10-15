/**
 * Whether two declarations are the same, as a module evaluated again declares them, such as on a hot reload. Systems
 * and finalizers they list compare by name, since evaluating their modules again makes new ones.
 */
export const sameDeclaration = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
    if ("declaration" in a && "name" in a && "declaration" in b && "name" in b) return a.name === b.name;
    const keys = Reflect.ownKeys(a);
    return keys.length === Reflect.ownKeys(b).length && keys.every(key => Reflect.has(b, key) && sameDeclaration(Reflect.get(a, key), Reflect.get(b, key)));
};
