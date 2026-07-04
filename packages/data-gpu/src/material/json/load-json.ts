import { fromJsonString } from "./from-json-string.js";
import type { FromJsonResult } from "./from-json.js";

export type LoadJsonResult =
    | FromJsonResult
    | { readonly ok: false; readonly reason: "fetch_failed"; readonly status: number };

export const loadJson = async (url: string): Promise<LoadJsonResult> => {
    const response = await fetch(url);
    if (!response.ok) {
        return { ok: false, reason: "fetch_failed", status: response.status };
    }
    const text = await response.text();
    return fromJsonString(text);
};
