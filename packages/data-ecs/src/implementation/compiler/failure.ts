/** Where an inlined function failed: the function, and the failing line in its file. */
export type Frame = { readonly name: string; readonly file: string; readonly line: number; readonly column: number };

/**
 * A build error at a source offset in the module being transformed. When it is inside functions inlined from other
 * modules, `position` is the call in that module and `frames` lead to the failure, innermost first.
 */
export type Failure = { readonly message: string; readonly position: number; readonly frames: readonly Frame[] };

const failures = new WeakMap<object, Failure>();

const abort = (failure: Failure): never => {
    const error = new Error(failure.message);
    failures.set(error, failure);
    throw error;
};

/** Aborts compiling the current module; `transformKernels` returns it as a `Failure`. */
export const fail = (node: { readonly start: number }, message: string): never => abort({ message, position: node.start, frames: [] });

export const failureOf = (error: unknown): Failure | undefined =>
    typeof error === "object" && error !== null ? failures.get(error) : undefined;

/** Runs `compile`; a failure inside it moves to `node`, recording `frame` for where it was. */
export const within = <T>(node: { readonly start: number }, frame: (position: number) => Frame, compile: () => T): T => {
    try {
        return compile();
    } catch (error) {
        const failure = failureOf(error);
        if (failure === undefined) throw error;
        return abort({ message: failure.message, position: node.start, frames: [...failure.frames, frame(failure.position)] });
    }
};

/** A failure's message followed by its frames, as a stack trace shows them. */
export const describeFailure = (failure: Failure): string =>
    [failure.message, ...failure.frames.map(frame => `    at ${frame.name} (${frame.file}:${frame.line}:${frame.column})`)].join("\n");
