import { describe, expect, it } from "vitest";
import type * as Fixture from "./remote-objects.fixture.js";

/** Objects a joined worker fills: the cases, over the fixture built for node or from source. */
export const remoteObjectsCases = (load: () => Promise<typeof Fixture>) => describe("objects a joined thread fills", () => {
    it("give the observer factories on a joined worker its objects as of the struct values they're read with, through the structure epoch while the world applies", async () => {
        const fixture = await load();
        const watched = await fixture.watchedWhileApplying(400, "factory");
        expect(watched).toEqual({ values: 400, inconsistent: 0, captions: ["none", null] });
    }, 30000);
    it("give a joined worker's synced systems its objects as of the struct values they look up with", async () => {
        const fixture = await load();
        const watched = await fixture.watchedWhileApplying(400, "synced");
        expect(watched).toEqual({ values: 400, inconsistent: 0, captions: ["none", null] });
    }, 30000);
});
