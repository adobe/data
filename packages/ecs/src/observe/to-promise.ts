import type { Observe } from './observe.js';

/** The first value an observer gets; it stops observing after it, even when that value comes during the subscribing call. */
export const toPromise = <T>(observe: Observe<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    let resolved = false;
    let stop: (() => void) | null = null;
    const tryStop = (): void => {
        if (stop !== null) stop();
        else queueMicrotask(tryStop);
    };
    try {
        stop = observe(value => {
            if (resolved) return;
            resolved = true;
            resolve(value);
            tryStop();
        });
    }
    catch (error) {
        reject(error);
    }
});
