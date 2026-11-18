// © 2026 Adobe. MIT License. See /LICENSE for details.

/** The part of `host`'s shadow root `selector` finds, of `type`. */
export const part = <E extends Element>(host: Element, selector: string, type: abstract new () => E): E => {
    const found = host.shadowRoot?.querySelector(selector);
    if (!(found instanceof type)) throw new Error(`No ${selector}.`);
    return found;
};
