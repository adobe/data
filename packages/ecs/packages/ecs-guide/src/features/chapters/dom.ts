// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { chapterNumber, inOrder, part, prose, shown, slug, title } from "./data.js";
import type { GuideNav, NavChapter } from "./elements/guide-nav.js";
import type { GuideProse } from "./elements/guide-prose.js";

/** The page's navigation and prose; null until the page provides them. */
export const nav = Symbol();
export const proseElement = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [nav]: { type: GuideNav | null; thread: "main" };
        [proseElement]: { type: GuideProse | null; thread: "main" };
    }
}

/** Lists the chapters in the navigation, in order, whenever a chapter is added. */
export const bindChapters = System.create({
    observer: true,
    resources: { is: [nav] },
    lookup: { chapters: { index: inOrder, changed: true } },
}, ({ resources, lookup }) => {
    const listed = lookup.chapters();
    const chapters: NavChapter[] = [];
    for (let index = 0; index < listed.length; index++) {
        const item = listed.at(index);
        chapters.push({ slug: item[slug], number: item[chapterNumber], title: item[title], part: item[part] });
    }
    resources[nav].chapters = chapters;
});

/** Shows the shown chapter: selected in the navigation, its prose, and its title in the page's. */
export const bindShown = System.create({
    observer: true,
    components: { with: [shown, slug, chapterNumber, title, prose], changed: [shown] },
    resources: { is: [nav, proseElement] },
}, (row, { resources }) => {
    resources[nav].selected = row[slug];
    resources[proseElement].heading = row[chapterNumber] === 0 ? row[title] : `${row[chapterNumber]}. ${row[title]}`;
    resources[proseElement].html = row[prose];
    document.title = `${row[title]} · ECS Guide`;
});

/** The chapters feature's DOM systems, as one composite: added, it runs on every tick. */
export const dom = System.create([bindChapters, bindShown]);
