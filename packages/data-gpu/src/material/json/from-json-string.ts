import { fromJson, type FromJsonResult } from "./from-json.js";

export const fromJsonString = (text: string): FromJsonResult => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, reason: "not_object" };
    }
    return fromJson(parsed);
};
