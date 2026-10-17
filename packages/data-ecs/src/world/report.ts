/** What went wrong in a run, as data. Empty lists and a zero mean the run succeeded. */
export type Report = {
    /** Systems, finalizers and GPU work that failed, in the order they ran. */
    readonly failures: readonly Failure[];
    /** Systems that didn't run because one in an earlier tier failed. */
    readonly skipped: readonly string[];
    /** Commands that did nothing, since their entity wasn't alive at the sync point. */
    readonly dropped: number;
};

export type Failure = {
    readonly kind: "system" | "finalizer" | "gpu";
    /** The system or finalizer that failed; for GPU work, the system whose run submitted it. */
    readonly name: string;
    /** An Error's message, or String() of anything else thrown. */
    readonly message: string;
    /** The thrown Error's `stack`, as the JavaScript engine formats it, for logs and display; null when it had none. */
    readonly stack: string | null;
};
