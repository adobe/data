// © 2026 Adobe. MIT License. See /LICENSE for details.

// The sample browser: a tab per sample package, the one the URL's hash names shown in the frame, the first when it
// names none. Each package's page is its `src`, served beside this one. What follows the package in the hash, after a
// `/`, is the sample's own: `#ecs-guide/1-resources` opens the guide at its chapter. A sample that posts
// `{ kind: "ecs-sample-leaves" }` to this page is sent `{ kind: "ecs-sample-leave" }` before another is shown, which
// waits for its `{ kind: "ecs-sample-left" }`, a second at most.

import "@spectrum-web-components/theme/sp-theme.js";
import "@spectrum-web-components/theme/theme-dark.js";
import "@spectrum-web-components/theme/theme-light.js";
import "@spectrum-web-components/theme/scale-medium.js";

/** Colors the page as the system prefers, as the markup did before its first paint. */
const scheme = matchMedia("(prefers-color-scheme: light)");
const follow = (): void => document.querySelector("sp-theme")?.setAttribute("color", scheme.matches ? "light" : "dark");
scheme.addEventListener("change", follow);
follow();

const tabs = [...document.querySelectorAll<HTMLAnchorElement>('nav a[href^="#"]')];
const frame = document.querySelector("iframe");
const alone = document.querySelector<HTMLAnchorElement>("#alone");

/** Whether the sample shown asked to be told before it's left, which it says with `ecs-sample-leaves`. */
let leaves = false;
let left: (() => void) | null = null;
addEventListener("message", event => {
    if (frame === null || event.source !== frame.contentWindow || event.origin !== location.origin || typeof event.data !== "object" || event.data === null) return;
    const kind: unknown = Reflect.get(event.data, "kind");
    if (kind === "ecs-sample-leaves") leaves = true;
    if (kind === "ecs-sample-left") left?.();
});

/** How long a sample that asked to be told before it's left may take to answer that it's done. */
const leaving = 1000;

/** Tells the sample shown that it's being left and waits for its answer, if it asked to be told, at most `leaving`. */
const leave = (): Promise<void> => {
    if (!leaves || frame === null) return Promise.resolve();
    leaves = false;
    return new Promise(resolve => {
        const done = (): void => {
            left = null;
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(done, leaving);
        left = done;
        frame.contentWindow?.postMessage({ kind: "ecs-sample-leave" }, location.origin);
    });
};

/** Counts the pages chosen, so only the latest is shown once the sample before it has left. */
let chosenCount = 0;

const show = async (): Promise<void> => {
    const [name = "", ...rest] = location.hash.slice(1).split("/");
    const chosen = tabs.find(tab => tab.hash === `#${name}`) ?? tabs[0];
    if (chosen === undefined || frame === null) return;
    const inner = rest.length === 0 ? "" : `#${rest.join("/")}`;
    const page = `../${chosen.hash.slice(1)}/src/${inner}`;
    for (const tab of tabs) if (tab === chosen) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
    if (alone !== null) alone.href = page;
    document.title = `${chosen.textContent ?? ""} · ECS Samples`;
    if (frame.getAttribute("src") === page) return;
    const count = ++chosenCount;
    await leave();
    if (count === chosenCount) frame.setAttribute("src", page);
};

addEventListener("hashchange", () => void show());
void show();
