/**
 * The logical threads, by augmentation: `interface Threads { audio: true }`. A logical thread is where object values
 * live and where the code touching them runs. A worker can fill several; one that no thread claims is filled by `world`.
 */
export interface Threads {
    /** The thread that created the world. */
    world: true;
    /** The window's thread, where the DOM is. */
    main: true;
}

/** A logical thread's name. */
export type Thread = keyof Threads & string;
