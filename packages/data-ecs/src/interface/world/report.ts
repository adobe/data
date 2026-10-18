/** What went wrong in a run, as data. Empty lists and a zero mean the run succeeded. */
export type Report = {
    /** Systems, finalizers, GPU work, observers and threads that failed, in the order they ran or were found. */
    readonly failures: readonly Failure[];
    /**
     * The labels of systems that didn't run: those in tiers after one that failed, and those of a joined thread that's
     * gone, each with a `"thread"` failure.
     */
    readonly skipped: readonly string[];
    /** Commands that did nothing, since their entity wasn't alive at the sync point. */
    readonly dropped: number;
    /**
     * What ran but slowed the run. `"blocking"`: a system that runs on a thread a joined thread fills and isn't
     * terminal, so its tier waited for that thread, by the system's label.
     */
    readonly warnings: readonly { readonly kind: "blocking"; readonly name: string; readonly message: string }[];
};

export type Failure = {
    /**
     * What failed: a system or finalizer that threw, GPU work, an observer, or a system whose thread is gone, which
     * didn't run; later tiers still run after a `"thread"` failure.
     */
    readonly kind: "system" | "finalizer" | "gpu" | "observer" | "thread";
    /**
     * The label of the system or finalizer that failed; for GPU work, of the system whose run submitted it; for an
     * observer, what it observes, by the labels of its keys or the entity's number. Labels are for display: a system's
     * or finalizer's is its name while no other registered system, rule or finalizer has it, else its name with its id,
     * or numbered without one; a key's is its description, else its id, or numbered without one.
     */
    readonly name: string;
    /** An Error's message, or String() of anything else thrown. */
    readonly message: string;
    /** The thrown Error's `stack`, as the JavaScript engine formats it, for logs and display; null when it had none. */
    readonly stack: string | null;
};
