// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { passOn } from "./isolation-worker.ts";

it("passes a request on again when the network fails it once, and gives a network error, not a rejection, when it fails again", async () => {
    let calls = 0;
    const flaky = async (): Promise<Response> => {
        calls++;
        if (calls === 1) throw new TypeError("Failed to fetch");
        return new Response("ok");
    };
    expect(await (await passOn(new Request("http://samples/a.ts"), flaky)).text()).toBe("ok");
    expect(calls).toBe(2);
    const failing = async (): Promise<Response> => { throw new TypeError("Failed to fetch"); };
    expect((await passOn(new Request("http://samples/a.ts"), failing)).type).toBe("error");
    const aborted = new AbortController();
    aborted.abort();
    calls = 0;
    expect((await passOn(new Request("http://samples/a.ts", { signal: aborted.signal }), async () => { calls++; throw new DOMException("aborted", "AbortError"); })).type).toBe("error");
    expect(calls).toBe(1);
});
