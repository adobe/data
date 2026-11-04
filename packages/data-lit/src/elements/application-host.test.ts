// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { html } from "lit";
import type { Service } from "@adobe/data/service";
import "./application-host.js";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

afterEach(() => {
    document.body.replaceChildren();
});

describe("ApplicationHost", () => {
    it("creates one service across a DOM move", async () => {
        const service = { serviceName: "main" } as unknown as Service;
        const pending = deferred<Service>();
        const createService = vi.fn(() => pending.promise);
        const host = document.createElement("application-host");
        host.createService = createService;
        host.renderElement = () => html``;

        const [parentA, parentB] = [document.createElement("div"), document.createElement("div")];
        document.body.append(parentA, parentB);
        parentA.append(host);
        parentB.append(host);
        pending.resolve(service);
        await pending.promise;
        await host.updateComplete;

        expect(createService).toHaveBeenCalledTimes(1);
        expect(host.service).toBe(service);

        parentA.append(host);
        await host.updateComplete;
        expect(createService).toHaveBeenCalledTimes(1);
    });

    it("retries creation after a failure", async () => {
        const service = { serviceName: "main" } as unknown as Service;
        const createService = vi.fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(service);
        const host = document.createElement("application-host");
        host.createService = createService;
        host.renderElement = () => html``;

        await expect(host.connectedCallback()).rejects.toThrow("offline");
        await host.connectedCallback();

        expect(createService).toHaveBeenCalledTimes(2);
        expect(host.service).toBe(service);
    });
});
