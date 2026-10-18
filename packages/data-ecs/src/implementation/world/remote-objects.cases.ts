import { describe, expect, it } from "vitest";
import type * as Fixture from "./remote-objects.fixture.js";

/** Objects a joined worker fills: the cases, over the fixture built for node or from source. */
export const remoteObjectsCases = (load: () => Promise<typeof Fixture>) => describe("objects a joined thread fills", () => {
    it("give a joined worker's observers its objects as of the values they're given, read through the structure epoch while the world applies", async () => {
        const fixture = await load();
        const watched = await fixture.watchedWhileApplying(400);
        expect(watched).toEqual({ values: 400, inconsistent: 0, captions: ["none", null] });
    }, 30000);
});
