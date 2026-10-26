// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Handles one request at a time, the newest asked for: a request still waiting when a later one arrives is passed to
 * `superseded` instead, so work never backs up behind requests already out of date.
 */
export const latest = <T>(handle: (request: T) => Promise<void>, superseded: (request: T) => void): ((request: T) => void) => {
    let waiting: { readonly request: T } | null = null;
    let busy = false;
    const drain = async (): Promise<void> => {
        busy = true;
        while (waiting !== null) {
            const { request } = waiting;
            waiting = null;
            await handle(request);
        }
        busy = false;
    };
    return request => {
        if (waiting !== null) superseded(waiting.request);
        waiting = { request };
        if (!busy) void drain();
    };
};

/**
 * Answers requests one at a time, as `latest` handles them: a request answered once a later one was asked, or
 * superseded while it waited, gets `none`, so only the newest's answer is ever used.
 */
export const latestAnswer = <T, R>(answer: (request: T) => Promise<R>, none: R): ((request: T) => Promise<R>) => {
    let newest = 0;
    const ask = latest<{ readonly request: T; readonly serial: number; readonly resolve: (result: R) => void }>(async ({ request, serial, resolve }) => {
        const result = await answer(request);
        resolve(serial === newest ? result : none);
    }, ({ resolve }) => resolve(none));
    return request => new Promise<R>(resolve => ask({ request, serial: ++newest, resolve }));
};
