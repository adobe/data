// © 2026 Adobe. MIT License. See /LICENSE for details.
/** What failed in a run: a system, finalizer, GPU work, thread or unique index. */
export type Failure = {
    /**
     * What failed: a system or finalizer that threw, GPU work, a system whose thread is gone, which didn't run, or a
     * unique index found holding two entities for one key, of which lookups give the one with the lower entity index;
     * later tiers still run after a `"thread"` or `"index"` failure.
     */
    readonly kind: "system" | "finalizer" | "gpu" | "thread" | "index";
    /**
     * The label of the system or finalizer that failed; for GPU work, of the system whose run submitted it; for an
     * index, the index's, with the key and both entities in `message`. Labels are for display and needn't be unique:
     * its binding, or for one made in a function the binding or function it's in, or its kind numbered.
     */
    readonly name: string;
    /** The id the plugin gave it, its package, module and binding (`@app/game@1.0.0/src/move.ts#move`); null without one. */
    readonly id: string | null;
    /** An Error's message, or String() of anything else thrown. */
    readonly message: string;
    /** The thrown Error's `stack`, as the JavaScript engine formats it, for logs and display; null when it had none. */
    readonly stack: string | null;
};

/**
 * What ran but slowed a run. `"blocking"`: a system that runs on a thread a joined thread fills and isn't terminal, so
 * its tier waited for that thread, by the system's label.
 */
export type Warning = { readonly kind: "blocking"; readonly name: string; readonly id: string | null; readonly message: string };
