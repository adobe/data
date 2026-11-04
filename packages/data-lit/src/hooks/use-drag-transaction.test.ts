// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { AsyncArgsProvider } from "@adobe/data/ecs";
import { useDragTransaction } from "./use-drag-transaction.js";
import type { DragEnd, DragMove } from "./use-drag-observe.js";
import { createHost, pointerCancel, pointerDown, pointerMove, pointerUp, render, unmount } from "./test-host.test-utils.js";

type Args = { x: number };

function mountTransaction(update: (drag: DragMove | DragEnd) => Args | void = drag => ({ x: drag.position[0] })) {
    const host = createHost();
    const providers: AsyncArgsProvider<Args>[] = [];
    render(host, () => useDragTransaction<Args>({ transaction: provider => { providers.push(provider); }, update }, []));
    const args = (index = 0) => providers[index]() as AsyncGenerator<Args>;
    return { host, providers, args };
}

async function collect(generator: AsyncGenerator<Args>): Promise<Args[]> {
    const values: Args[] = [];
    for await (const value of generator) values.push(value);
    return values;
}

describe("useDragTransaction", () => {
    it("yields move and end arguments and completes at the end", async () => {
        const { host, args } = mountTransaction();
        pointerDown(host);
        pointerMove(20);
        pointerUp(50);
        expect(await collect(args())).toEqual([{ x: 20 }, { x: 50 }]);
        unmount(host);
    });

    it("skips drags for which update returns nothing and still completes", async () => {
        const { host, args } = mountTransaction(drag => (drag.type === "move" ? { x: drag.position[0] } : undefined));
        pointerDown(host);
        pointerMove(20);
        pointerUp(50);
        expect(await collect(args())).toEqual([{ x: 20 }]);
        unmount(host);
    });

    it("rejects a pending read when the drag is cancelled", async () => {
        const { host, args } = mountTransaction();
        pointerDown(host);
        pointerMove(20);
        const generator = args();
        expect(await generator.next()).toEqual({ done: false, value: { x: 20 } });

        const pending = generator.next();
        pointerCancel();
        await expect(pending).rejects.toThrow("Drag cancelled");
        unmount(host);
    });

    it("rejects a pending read when unmounted mid-drag", async () => {
        const { host, args } = mountTransaction();
        pointerDown(host);
        pointerMove(20);
        const generator = args();
        await generator.next();

        const pending = generator.next();
        unmount(host);
        await expect(pending).rejects.toThrow("Drag cancelled");
    });

    it("starts one transaction per drag", async () => {
        const { host, providers, args } = mountTransaction();
        pointerDown(host);
        pointerMove(20);
        pointerUp(20);
        pointerDown(host);
        pointerMove(40);
        pointerUp(40);
        expect(providers).toHaveLength(2);
        expect(await collect(args(1))).toEqual([{ x: 40 }, { x: 40 }]);
        unmount(host);
    });

    it("does not start a transaction for a press below the drag threshold", () => {
        const { host, providers } = mountTransaction();
        pointerDown(host);
        pointerUp(2);
        expect(providers).toHaveLength(0);
        unmount(host);
    });

    it("lets an async transaction settle after cancellation without an unhandled rejection", async () => {
        const host = createHost();
        let settled: Promise<void> | undefined;
        render(host, () => useDragTransaction<Args>({
            transaction: provider => {
                settled = (async () => {
                    for await (const _ of provider() as AsyncGenerator<Args>) { /* consume */ }
                })();
                return settled;
            },
            update: drag => ({ x: drag.position[0] }),
        }, []));
        pointerDown(host);
        pointerMove(20);
        pointerCancel();
        await expect(settled).rejects.toThrow("Drag cancelled");
        await new Promise(resolve => setTimeout(resolve));
        unmount(host);
    });
});
