/** What tests of elements share: no world, only the DOM. */

export type Recorded = { readonly type: string; readonly detail: unknown; readonly target: EventTarget | null };

/** Records the events of `types` that reach `target`, in order. */
export const record = (target: EventTarget, ...types: (keyof HTMLElementEventMap)[]): Recorded[] => {
    const seen: Recorded[] = [];
    for (const type of types) target.addEventListener(type, event => seen.push({ type, detail: event instanceof CustomEvent ? event.detail : undefined, target: event.target }));
    return seen;
};

/** The part of `host`'s shadow root `selector` finds, of `type`. */
export const part = <E extends Element>(host: Element, selector: string, type: abstract new () => E): E => {
    const found = host.shadowRoot?.querySelector(selector);
    if (!(found instanceof type)) throw new Error(`No ${selector}.`);
    return found;
};

/** The mutations `change` makes to `host` and its shadow root. */
export const mutationsOf = (host: Element, change: () => void): MutationRecord[] => {
    const observer = new MutationObserver(() => {});
    observer.observe(host, { attributes: true, childList: true, characterData: true, subtree: true });
    if (host.shadowRoot !== null) observer.observe(host.shadowRoot, { attributes: true, childList: true, characterData: true, subtree: true });
    change();
    const records = observer.takeRecords();
    observer.disconnect();
    return records;
};
