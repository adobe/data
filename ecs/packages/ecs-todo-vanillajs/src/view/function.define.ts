// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Defines each of `elements`, by its tag name, that isn't defined yet. */
export const define = (elements: { readonly [name: string]: CustomElementConstructor }): void => {
    for (const [name, element] of Object.entries(elements)) if (customElements.get(name) === undefined) customElements.define(name, element);
};
