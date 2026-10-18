/** What went wrong in a run, as data. Empty lists and a zero mean the run succeeded. */
export type Report = {
    /** Systems, finalizers, GPU work, observers and threads that failed, in the order they ran or were found. */
    readonly failures: readonly Failure[];
    /** Systems that didn't run because one in an earlier tier failed, or the thread they run on is gone. */
    readonly skipped: readonly string[];
    /** Commands that did nothing, since their entity wasn't alive at the sync point. */
    readonly dropped: number;
};

export type Failure = {
    readonly kind: "system" | "finalizer" | "gpu" | "observer" | "thread";
    /**
     * The system or finalizer that failed; for GPU work, the system whose run submitted it; for an observer, what it
     * observes, by the labels of its keys or the entity's number; for a thread, its name, when the run needed it and it
     * was gone. A key's label is for display: its description, numbered when another key's label has it.
     */
    readonly name: string;
    /** An Error's message, or String() of anything else thrown. */
    readonly message: string;
    /** The thrown Error's `stack`, as the JavaScript engine formats it, for logs and display; null when it had none. */
    readonly stack: string | null;
};
