/** A build error at a source offset. */
export type Failure = { readonly message: string; readonly position: number };

const failures = new WeakMap<object, Failure>();

/** Aborts compiling the current module; `transformKernels` returns it as a `Failure`. */
export const fail = (node: { readonly start: number }, message: string): never => {
    const error = new Error(message);
    failures.set(error, { message, position: node.start });
    throw error;
};

export const failureOf = (error: unknown): Failure | undefined =>
    typeof error === "object" && error !== null ? failures.get(error) : undefined;
