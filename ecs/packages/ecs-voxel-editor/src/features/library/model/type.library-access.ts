// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/**
 * What reaches the library's folder, outside the world: each call reads or writes files and runs the systems that bring
 * them in or out, recording the library and what went wrong as it goes.
 */
export type LibraryAccess = {
    /** Asks the user for a folder, and lists its model files. */
    readonly choose: () => Promise<void>;
    /** Asks again for the folder chosen before, as after a reload. */
    readonly reconnect: () => Promise<void>;
    /** Opens the document at a path, with the files it references. */
    readonly open: (path: string) => Promise<void>;
    /**
     * Saves the document to `path`, and each referenced model's file it changed; `standalone`, as one file holding every
     * model, which leaves the document's path as it was.
     */
    readonly save: (options: { readonly path: string; readonly standalone: boolean; readonly thumbnails: readonly (readonly [string, string])[] }) => Promise<void>;
    /** Starts a new document. */
    readonly create: () => Promise<void>;
    /** Brings a library file's main model into the document as a referenced model; returns it, or none. */
    readonly reference: (path: string) => Promise<Entity>;
};
