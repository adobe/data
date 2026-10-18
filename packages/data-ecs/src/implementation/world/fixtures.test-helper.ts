/// <reference types="node" />
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * A fixture `vitest.fixtures.ts` built, `<name>.fixture.js`, imported natively, so its workers load `worker.js` beside it.
 * Its exports are the source fixture's, since it's built from it, so callers give the result the source's type.
 */
export const builtFixture = (name: string) =>
    import(/* @vite-ignore */ pathToFileURL(resolve(import.meta.dirname, "../../../dist/fixtures", `${name}.fixture.js`)).href);
