// © 2026 Adobe. MIT License. See /LICENSE for details.

// The sample browser: a tab per sample package, the one the URL's hash names shown in the frame, the first when it
// names none. Each package's page is its `src`, served beside this one. What follows the package in the hash, after a
// `/`, is the sample's own: `#ecs-guide/1-resources` opens the guide at its chapter.

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

const show = (): void => {
    const [name = "", ...rest] = location.hash.slice(1).split("/");
    const chosen = tabs.find(tab => tab.hash === `#${name}`) ?? tabs[0];
    if (chosen === undefined || frame === null) return;
    const inner = rest.length === 0 ? "" : `#${rest.join("/")}`;
    const page = `../${chosen.hash.slice(1)}/src/${inner}`;
    for (const tab of tabs) if (tab === chosen) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
    if (frame.getAttribute("src") !== page) frame.setAttribute("src", page);
    if (alone !== null) alone.href = page;
    document.title = `${chosen.textContent ?? ""} · ECS Samples`;
};

addEventListener("hashchange", show);
show();
