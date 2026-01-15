// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Options for configuring debounce behavior
 */
export interface DebounceOptions {
    /**
     * If true, the function is called on the leading edge of the timeout.
     * Default: false
     */
    readonly leading?: boolean;

    /**
     * If true, the function is called on the trailing edge of the timeout.
     * Default: true
     */
    readonly trailing?: boolean;

    /**
     * Maximum time function is allowed to be delayed before it's invoked.
     * If specified, the function will be called at most once per maxWait milliseconds.
     */
    readonly maxWait?: number;
}

/**
 * A debounced function with additional control methods
 */
export interface DebouncedFunction<TFunc extends (...args: any[]) => any> {
    /**
     * The debounced function. Preserves original function signature.
     */
    (...args: Parameters<TFunc>): void;

    /**
     * Cancel any pending invocation of the debounced function
     */
    cancel(): void;

    /**
     * Immediately invoke the debounced function and cancel any pending invocation
     */
    flush(): ReturnType<TFunc> | undefined;

    /**
     * Check if there is a pending invocation of the debounced function
     */
    pending(): boolean;
}

/**
 * Creates a debounced function that delays invoking `func` until after `wait` 
 * milliseconds have elapsed since the last time the debounced function was invoked.
 * 
 * The debounced function comes with methods to cancel delayed `func` invocations 
 * and to flush them immediately.
 * 
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param options - The options object for customizing behavior
 * @returns A debounced function with control methods
 * 
 * @example
 * ```typescript
 * const saveData = (id: string, data: any) => console.log('Saving', id, data);
 * const debouncedSave = debounce(saveData, 300);
 * 
 * // Multiple rapid calls - only the last one executes after 300ms
 * debouncedSave('1', { name: 'test' });
 * debouncedSave('2', { name: 'test2' }); // This will execute
 * 
 * // Cancel pending execution
 * debouncedSave.cancel();
 * 
 * // Force immediate execution
 * debouncedSave.flush();
 * ```
 */
export const debounce = <TFunc extends (...args: any[]) => any>(
    func: TFunc,
    wait: number,
    options: DebounceOptions = {}
): DebouncedFunction<TFunc> => {
    const { leading = false, trailing = true, maxWait } = options;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let maxTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let lastCallTime: number | undefined;
    let lastInvokeTime = 0;
    let lastArgs: Parameters<TFunc> | undefined;
    let result: ReturnType<TFunc> | undefined;

    const invokeFunc = (time: number): ReturnType<TFunc> => {
        const args = lastArgs!;
        lastArgs = undefined;
        lastInvokeTime = time;
        result = func(...args);
        return result as ReturnType<TFunc>;
    };

    const leadingEdge = (time: number): void => {
        lastInvokeTime = time;
        timeoutId = setTimeout(timerExpired, wait);
        if (leading) {
            invokeFunc(time);
        }
    };

    const timerExpired = (): void => {
        const time = Date.now();
        const timeSinceLastCall = time - (lastCallTime ?? 0);
        const timeSinceLastInvoke = time - lastInvokeTime;

        // If we have maxWait active, don't fire the regular timer - let maxWait handle it
        if (maxTimeoutId !== undefined && maxWait !== undefined && timeSinceLastInvoke < maxWait) {
            // Still within maxWait period, don't execute yet
            timeoutId = setTimeout(timerExpired, wait);
            return;
        }

        // Only execute if we've waited long enough
        if (timeSinceLastCall >= wait) {
            trailingEdge(time);
        } else {
            timeoutId = setTimeout(timerExpired, wait - timeSinceLastCall);
        }
    };

    const trailingEdge = (time: number): void => {
        timeoutId = undefined;
        if (maxTimeoutId !== undefined) {
            clearTimeout(maxTimeoutId);
            maxTimeoutId = undefined;
        }

        if (trailing && lastArgs !== undefined) {
            invokeFunc(time);
        }
        lastArgs = undefined;
    };

    const cancel = (): void => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
        if (maxTimeoutId !== undefined) {
            clearTimeout(maxTimeoutId);
            maxTimeoutId = undefined;
        }
        lastInvokeTime = 0;
        lastCallTime = undefined;
        lastArgs = undefined;
        result = undefined;
    };

    const flush = (): ReturnType<TFunc> | undefined => {
        if (timeoutId === undefined) return result;

        const time = Date.now();
        trailingEdge(time);
        return result;
    };

    const pending = (): boolean => {
        return timeoutId !== undefined;
    };

    const debounced = (...args: Parameters<TFunc>): void => {
        const time = Date.now();
        lastArgs = args;
        lastCallTime = time;

        if (timeoutId === undefined) {
            leadingEdge(time);

            // Start maxWait timer if configured
            if (maxWait !== undefined) {
                maxTimeoutId = setTimeout(() => {
                    maxTimeoutId = undefined;
                    if (timeoutId !== undefined) {
                        trailingEdge(Date.now());
                    }
                }, maxWait);
            }
        } else {
            // Timer is already running, just update the regular timer
            clearTimeout(timeoutId);
            timeoutId = setTimeout(timerExpired, wait);
        }
    };

    // Attach utility methods to the debounced function
    debounced.cancel = cancel;
    debounced.flush = flush;
    debounced.pending = pending;

    return debounced as DebouncedFunction<TFunc>;
};
