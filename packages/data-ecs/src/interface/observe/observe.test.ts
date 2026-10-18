import { describe, expect, it } from "vitest";
import { Observe } from "../index.js";

describe("Observe.toPromise", () => {
    it("resolves to the first value and stops observing, even when it comes while subscribing", async () => {
        let stopped = 0;
        const observe: Observe<number> = notify => { notify(1); notify(2); return () => { stopped++; }; };
        expect(await Observe.toPromise(observe)).toBe(1);
        expect(stopped).toBe(1);
    });
});
