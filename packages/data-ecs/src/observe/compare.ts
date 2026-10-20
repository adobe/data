// Comparing and testing component values for queries: equality, order, and `where` conditions compiled once.

/** Whether two values are equal: primitives by identity, objects and arrays by their own keys, recursively. */
export const equals = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    const keys = Reflect.ownKeys(a);
    if (keys.length !== Reflect.ownKeys(b).length) return false;
    for (let i = 0; i < keys.length; i++) if (!equals(Reflect.get(a, keys[i]), Reflect.get(b, keys[i]))) return false;
    return true;
};

/** Code points of two strings compared, never by locale, as sorted indexes order them. */
const compareStrings = (a: string, b: string): number => {
    const length = Math.min(a.length, b.length);
    for (let k = 0; k < length; k++) {
        const x = a.charCodeAt(k);
        const y = b.charCodeAt(k);
        if (x === y) continue;
        // A surrogate encodes a code point above every unit that isn't one.
        const xs = x >= 0xD800 && x <= 0xDFFF;
        const ys = y >= 0xD800 && y <= 0xDFFF;
        if (xs !== ys) return xs ? 1 : -1;
        return x < y ? -1 : 1;
    }
    return a.length - b.length;
};

/**
 * Orders values as sorted indexes do: numbers numerically with NaN after every number, booleans false first, strings
 * by code point, tuples element by element; anything else is equal.
 */
export const compare = (a: unknown, b: unknown): number => {
    if (typeof a === "number" && typeof b === "number") return compareNumbers(a, b);
    if (Array.isArray(a) && Array.isArray(b)) {
        const length = Math.min(a.length, b.length);
        for (let i = 0; i < length; i++) {
            const order = compare(a[i], b[i]);
            if (order !== 0) return order;
        }
        return a.length - b.length;
    }
    if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
    if (typeof a === "string" && typeof b === "string") return compareStrings(a, b);
    return 0;
};

/** Numbers in order, NaN after every other, -0 equal to 0. */
export const compareNumbers = (a: number, b: number): number => {
    if (a < b) return -1;
    if (a > b) return 1;
    if (a === b) return 0;
    const nanA = a !== a;
    return nanA === (b !== b) ? 0 : nanA ? 1 : -1;
};

const operators = new Set(["==", "!=", "<", ">", "<=", ">="]);

/** A `where` condition compiled once: a plain value is equality, an object of comparison operators is a comparison. */
export const predicateOf = (condition: unknown): ((value: unknown) => boolean) => {
    if (typeof condition !== "object" || condition === null || Array.isArray(condition)) {
        if (typeof condition === "number" || typeof condition === "string" || typeof condition === "boolean") return value => value === condition;
        return value => equals(value, condition);
    }
    const entries = Object.entries(condition);
    if (entries.length === 0 || !entries.every(([operator]) => operators.has(operator))) return value => equals(value, condition);
    const tests = entries.map(([operator, operand]): ((value: unknown) => boolean) => {
        switch (operator) {
            case "==": return value => equals(value, operand);
            case "!=": return value => !equals(value, operand);
            case "<": return typeof operand === "number" ? value => typeof value === "number" ? value < operand : compare(value, operand) < 0 : value => compare(value, operand) < 0;
            case ">": return typeof operand === "number" ? value => typeof value === "number" ? value > operand : compare(value, operand) > 0 : value => compare(value, operand) > 0;
            case "<=": return typeof operand === "number" ? value => typeof value === "number" ? value <= operand : compare(value, operand) <= 0 : value => compare(value, operand) <= 0;
            default: return typeof operand === "number" ? value => typeof value === "number" ? value >= operand : compare(value, operand) >= 0 : value => compare(value, operand) >= 0;
        }
    });
    if (tests.length === 1) return tests[0];
    if (tests.length === 2) {
        const [first, second] = tests;
        return value => first(value) && second(value);
    }
    return value => {
        for (let i = 0; i < tests.length; i++) if (!tests[i](value)) return false;
        return true;
    };
};
