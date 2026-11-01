// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createService, type Service } from "../check/language-service.js";
import { checkRequestOf, infoRequestOf, type CheckReply, type InfoReply } from "../check/messages.js";

/**
 * TypeScript's worker, as `typescript.ts` loads it: checks each chapter's examples as they change, and says what's at a
 * place in one, off the main thread; a failure is answered too.
 */

let service: Service | null = null;

const reasonOf = (error: unknown): string => `TypeScript failed: ${error instanceof Error ? error.message : String(error)}`;

/** Takes a message the page posted (`serve.ts`). */
export const handle = (data: unknown): void => {
    const asked = infoRequestOf(data);
    if (asked !== null) {
        let reply: InfoReply;
        try {
            service ??= createService();
            reply = { kind: "info", serial: asked.serial, info: service.info(asked.owner, asked.files, asked.file, asked.position), failure: null };
        } catch (error) {
            service = null;
            reply = { kind: "info", serial: asked.serial, info: null, failure: reasonOf(error) };
        }
        postMessage(reply);
        return;
    }
    const request = checkRequestOf(data);
    if (request === null) return;
    let reply: CheckReply;
    try {
        service ??= createService();
        reply = { kind: "checked", version: request.version, diagnostics: service.check(request.owner, request.files), failure: null };
    } catch (error) {
        // A language service that threw may be left broken, so the next request starts another.
        service = null;
        reply = { kind: "checked", version: request.version, diagnostics: [], failure: reasonOf(error) };
    }
    postMessage(reply);
};
