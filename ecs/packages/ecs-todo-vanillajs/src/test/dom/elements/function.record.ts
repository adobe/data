// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Records the events of `types` that reach `target`, in order. */
export const record = (target: EventTarget, ...types: (keyof HTMLElementEventMap)[]): Recorded[] => {
    const seen: Recorded[] = [];
    for (const type of types) target.addEventListener(type, event => seen.push({ type, detail: event instanceof CustomEvent ? event.detail : undefined, target: event.target }));
    return seen;
};

/** An event a test recorded: its type, its detail, and where it was dispatched. */
type Recorded = { readonly type: string; readonly detail: unknown; readonly target: EventTarget | null };
