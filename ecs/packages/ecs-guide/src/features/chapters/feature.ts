// © 2026 Adobe. MIT License. See /LICENSE for details.
import { marked } from "marked";
import { chapters as content } from "../../content/guide.js";
import type { Feature } from "../../shared/feature.js";
import { dom, nav, proseElement } from "./dom.js";
import { GuideNav } from "./elements/guide-nav.js";
import { GuideProse } from "./elements/guide-prose.js";
import { connect } from "./events.js";
import { addChapters } from "./model.js";

/** Chapters: the guide's sections, listed in the navigation, one shown with its prose at a time, as the address says. */
export const chapters: Feature = {
    elements: { "guide-nav": GuideNav, "guide-prose": GuideProse },
    resources: root => ({ [nav]: root.querySelector("guide-nav"), [proseElement]: root.querySelector("guide-prose") }),
    system: dom,
    connect,
    start: async world => {
        await world.run(addChapters, { chapters: content.map(item => ({ number: item.number, slug: item.slug, title: item.title, part: item.part, package: item.package, prose: marked.parse(item.prose, { async: false }) })) });
    },
};
