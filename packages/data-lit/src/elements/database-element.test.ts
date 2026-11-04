// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { html } from "lit";
import { Database } from "@adobe/data/ecs";
import { DatabaseElement } from "./database-element.js";

const rootPlugin = Database.Plugin.create({ resources: { name: { default: "root" as string } } });
const childPlugin = Database.Plugin.create({ resources: { count: { default: 0 as number } } });

class ProbeElement extends DatabaseElement<typeof childPlugin> {
    get plugin() {
        return childPlugin;
    }
    fullDatabase() {
        return this.database;
    }
    override render() {
        return html`${this.database.resources.count}`;
    }
}
customElements.define("database-element-probe", ProbeElement);

class UnrenderedElement extends DatabaseElement<typeof childPlugin> {
    get plugin() {
        return childPlugin;
    }
}
customElements.define("database-element-unrendered", UnrenderedElement);

const create = () => document.createElement("database-element-probe") as ProbeElement;
const resources = (db: unknown) => (db as { resources: Record<string, unknown> }).resources;

afterEach(async () => {
    document.body.replaceChildren();
    await Promise.resolve();
});

describe("DatabaseElement", () => {
    it("creates its own database when no ancestor provides one", async () => {
        const element = create();
        document.body.append(element);
        expect(Database.is(element.fullDatabase())).toBe(true);
        expect(resources(element.service).count).toBe(0);
        await element.updateComplete;
        expect(element.shadowRoot?.textContent).toBe("0");
    });

    it("extends the nearest ancestor database with its plugin", () => {
        const root = Database.create(rootPlugin);
        const parent = Object.assign(document.createElement("div"), { service: root });
        document.body.append(parent);
        const element = create();
        parent.append(element);
        expect(resources(element.service).name).toBe("root");
        expect(resources(element.service).count).toBe(0);
    });

    it("finds the database of an ancestor database element", () => {
        const outer = create();
        document.body.append(outer);
        const inner = create();
        outer.append(inner);
        expect(inner.fullDatabase()).toBe(outer.fullDatabase());
    });

    it("skips ancestor services that are not databases", () => {
        const parent = Object.assign(document.createElement("div"), { service: { serviceName: "other" } });
        document.body.append(parent);
        const element = create();
        parent.append(element);
        expect(Database.is(element.fullDatabase())).toBe(true);
    });

    it("keeps an injected database and requests an update when it changes", () => {
        const injected = Database.create(childPlugin);
        const element = create();
        const requestUpdate = vi.spyOn(element, "requestUpdate");
        element.service = injected;
        expect(requestUpdate).toHaveBeenCalledWith("service", undefined);
        document.body.append(element);
        expect(element.fullDatabase()).toBe(injected);
    });

    it("routes a database bound before the element upgraded through the service setter", () => {
        const injected = Database.create(childPlugin);
        const element = document.createElement("database-element-late");
        (element as unknown as { service: unknown }).service = injected;
        document.body.append(element);

        class LateElement extends ProbeElement {}
        customElements.define("database-element-late", LateElement);
        const upgraded = element as unknown as LateElement;
        expect(Object.prototype.hasOwnProperty.call(upgraded, "service")).toBe(false);
        expect(upgraded.fullDatabase()).toBe(injected);
    });

    it("keeps its database across a reconnect", () => {
        const element = create();
        document.body.append(element);
        const database = element.fullDatabase();
        element.remove();
        document.body.append(element);
        expect(element.fullDatabase()).toBe(database);
    });

    it("throws from the default render", () => {
        const element = new UnrenderedElement();
        expect(() => element.render()).toThrow("render function must be overridden");
    });
});
