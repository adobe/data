// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { latest, latestAnswer } from "./latest.js";

it("handles one request at a time, the newest, superseding those that waited", async () => {
    const events: string[] = [];
    let running = 0;
    let most = 0;
    const finish: (() => void)[] = [];
    const ask = latest<number>(async request => {
        running++;
        most = Math.max(most, running);
        events.push(`start ${request}`);
        await new Promise<void>(resolve => finish.push(resolve));
        events.push(`end ${request}`);
        running--;
    }, request => events.push(`superseded ${request}`));
    ask(1);
    ask(2);
    ask(3);
    ask(4);
    await Promise.resolve();
    finish.shift()?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    finish.shift()?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(events).toEqual(["start 1", "superseded 2", "superseded 3", "end 1", "start 4", "end 4"]);
    expect(most).toBe(1);
});

it("answers only the newest request, one at a time: a reply to one asked before another is dropped", async () => {
    const asked: string[] = [];
    const replies: ((value: string) => void)[] = [];
    const answer = latestAnswer<string, string | null>(request => {
        asked.push(request);
        return new Promise(resolve => replies.push(resolve));
    }, null);
    const first = answer("a");
    const second = answer("b");
    const third = answer("c");
    await Promise.resolve();
    expect(asked).toEqual(["a"]);
    replies.shift()?.("for a");
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(asked).toEqual(["a", "c"]);
    replies.shift()?.("for c");
    expect(await third).toBe("for c");
});
