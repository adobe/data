// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * JSON serialization extended with `Map` and `Set` support in both directions.
 *
 * `Map` and `Set` have no JSON representation (`JSON.stringify` emits `{}` for
 * both), so they are encoded as tagged wrapper objects and reconstructed on parse:
 *   Map -> { __type: "Map", __value: [[key, value], ...] }
 *   Set -> { __type: "Set", __value: [value, ...] }
 *
 * An optional replacer/reviver is applied around the Map/Set transform so higher
 * level serializers (e.g. the codec system in serialize.ts) can compose their own
 * encoding on top of this one. On stringify the caller's replacer runs first, then
 * Map/Set are encoded; on parse this is mirrored — Map/Set are decoded first, then
 * the caller's reviver runs.
 */

const TYPE_KEY = "__type";
const VALUE_KEY = "__value";
const MAP_TYPE = "Map";
const SET_TYPE = "Set";

export function stringify(
    value: unknown,
    replacer?: (this: any, key: string, value: any) => any,
): string {
    return JSON.stringify(value, function (this: any, key, val) {
        const replaced = replacer ? replacer.call(this, key, val) : val;
        if (replaced instanceof Map) {
            return { [TYPE_KEY]: MAP_TYPE, [VALUE_KEY]: [...replaced] };
        }
        if (replaced instanceof Set) {
            return { [TYPE_KEY]: SET_TYPE, [VALUE_KEY]: [...replaced] };
        }
        return replaced;
    });
}

export function parse<T = unknown>(
    text: string,
    reviver?: (this: any, key: string, value: any) => any,
): T {
    return JSON.parse(text, function (this: any, key, val) {
        let revived = val;
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            if (val[TYPE_KEY] === MAP_TYPE && Array.isArray(val[VALUE_KEY])) {
                revived = new Map(val[VALUE_KEY]);
            } else if (val[TYPE_KEY] === SET_TYPE && Array.isArray(val[VALUE_KEY])) {
                revived = new Set(val[VALUE_KEY]);
            }
        }
        return reviver ? reviver.call(this, key, revived) : revived;
    });
}
