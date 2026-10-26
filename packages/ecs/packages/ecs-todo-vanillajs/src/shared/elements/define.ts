// © 2026 Adobe. MIT License. See /LICENSE for details.
/** Elements by their tag names, as a feature lists those it creates or finds on the page. */
export type Elements = { readonly [name: string]: CustomElementConstructor };

/** Defines each of `elements` not defined yet. */
export const define = (elements: Elements): void => {
    for (const [name, element] of Object.entries(elements)) if (customElements.get(name) === undefined) customElements.define(name, element);
};
