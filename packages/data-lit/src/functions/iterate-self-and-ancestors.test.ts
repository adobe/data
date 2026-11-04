// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { iterateSelfAndAncestors } from "./iterate-self-and-ancestors.js";

const tags = (element: Element) => [...iterateSelfAndAncestors(element)].map(e => e.tagName.toLowerCase());

describe("iterateSelfAndAncestors", () => {
    it("walks light-DOM parents", () => {
        const section = document.createElement("section");
        const span = section.appendChild(document.createElement("div")).appendChild(document.createElement("span"));
        expect(tags(span)).toEqual(["span", "div", "section"]);
    });

    it("crosses from a shadow root to its host", () => {
        const host = document.createElement("section");
        const inner = host.attachShadow({ mode: "open" }).appendChild(document.createElement("article"));
        expect(tags(inner)).toEqual(["article", "section"]);
    });

    it("follows an assigned slot through the shadow tree before the light parent", () => {
        const host = document.createElement("section");
        const article = host.attachShadow({ mode: "open" }).appendChild(document.createElement("article"));
        const slot = article.appendChild(document.createElement("slot"));
        const span = host.appendChild(document.createElement("span"));
        Object.defineProperty(span, "assignedSlot", { value: slot });

        expect(tags(span)).toEqual(["span", "slot", "article", "section"]);
    });
});
