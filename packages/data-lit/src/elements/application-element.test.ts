// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { html } from "lit";
import type { Service } from "@adobe/data/service";
import { ApplicationElement } from "./application-element.js";
import { useState } from "../hooks/use-state.js";

type MainService = Service & { kind: "main" };
const createService = (kind: string) => ({ serviceName: kind, kind }) as unknown as MainService;

class ProbeElement extends ApplicationElement<MainService> {
    override render() {
        const [value] = useState("hooked");
        return html`${value}`;
    }
}
customElements.define("application-element-probe", ProbeElement);

class UnrenderedElement extends ApplicationElement<MainService> {}
customElements.define("application-element-unrendered", UnrenderedElement);

function under(parent: Element) {
    const element = document.createElement("application-element-probe") as ProbeElement;
    parent.append(element);
    return element;
}

afterEach(async () => {
    document.body.replaceChildren();
    await Promise.resolve();
});

describe("ApplicationElement", () => {
    it("finds the nearest ancestor service on connect", () => {
        const outer = Object.assign(document.createElement("div"), { service: createService("outer") });
        const inner = Object.assign(document.createElement("div"), { service: createService("inner") });
        outer.append(inner);
        document.body.append(outer);
        expect(under(inner).service).toBe(inner.service);
    });

    it("keeps an injected service", () => {
        const parent = Object.assign(document.createElement("div"), { service: createService("ancestor") });
        document.body.append(parent);
        const injected = createService("injected");
        const element = document.createElement("application-element-probe") as ProbeElement;
        element.service = injected;
        parent.append(element);
        expect(element.service).toBe(injected);
    });

    it("skips ancestors that fail the type guard", () => {
        const matching = Object.assign(document.createElement("div"), { service: createService("main") });
        const other = Object.assign(document.createElement("div"), { service: { serviceName: "other" } });
        matching.append(other);
        document.body.append(matching);
        const element = document.createElement("application-element-probe") as ProbeElement;
        element.typeGuard = (service): service is MainService => (service as MainService | undefined)?.kind === "main";
        other.append(element);
        expect(element.service).toBe(matching.service);
    });

    it("skips values that are not services and leaves service unset without a provider", () => {
        const parent = Object.assign(document.createElement("div"), { service: { notAService: true } });
        document.body.append(parent);
        expect(under(parent).service).toBeUndefined();
    });

    it("renders with hooks", async () => {
        const element = under(document.body);
        await element.updateComplete;
        expect(element.shadowRoot?.textContent).toBe("hooked");
    });

    it("throws from the default render", () => {
        const element = new UnrenderedElement();
        expect(() => element.render()).toThrow("render function must be overridden");
    });
});
