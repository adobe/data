// © 2026 Adobe. MIT License. See /LICENSE for details.

// The sample browser: a tab per sample, the one the URL's hash names shown in the frame, the first when it names none.

const tabs = [...document.querySelectorAll<HTMLAnchorElement>('nav a[href^="#"]')];
const frame = document.querySelector("iframe");
const alone = document.querySelector<HTMLAnchorElement>("#alone");

const show = (): void => {
    const chosen = tabs.find(tab => tab.hash === location.hash) ?? tabs[0];
    if (chosen === undefined || frame === null) return;
    const page = `./${chosen.hash.slice(1)}/`;
    for (const tab of tabs) if (tab === chosen) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
    if (frame.getAttribute("src") !== page) frame.setAttribute("src", page);
    if (alone !== null) alone.href = page;
    document.title = `${chosen.textContent ?? ""} · ECS Samples`;
};

addEventListener("hashchange", show);
show();
