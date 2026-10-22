// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inject } from "vitest";

declare module "vitest" {
    export interface ProvidedContext {
        /** This run's built fixtures, which `vitest.fixtures.ts` provides. */
        readonly fixturesDirectory: string;
    }
}

/**
 * A fixture `vitest.fixtures.ts` built for this run, `<name>.fixture.js`, imported natively, so its workers load
 * `worker.js` beside it. Its exports are the source fixture's, since it's built from it, so callers give the result the
 * source's type.
 */
export const builtFixture = (name: string) =>
    import(/* @vite-ignore */ pathToFileURL(resolve(inject("fixturesDirectory"), `${name}.fixture.js`)).href);
