// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Observe } from "@adobe/data/observe";
import { type Schema } from "@adobe/data/schema";
import { AsyncDataService, type Service } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";

/**
 * The service the SUB frame exposes to the MAIN frame — the mirror of
 * {@link MainService}, so every communication kind also runs main → sub:
 *  - `status` OBSERVE   — the sub's status; the main renders it live.
 *  - `inbox`  OBSERVE   — messages the sub received (written by the main via `notify`).
 *  - `echo`   PROMISE   — request/response.
 *  - `countUp` GENERATOR — a pull-based stream.
 *  - `notify` VOID      — fire-and-forget; its effect shows up in `inbox`.
 */
export interface SubService extends Service {
    status: Observe<string>;
    inbox: Observe<readonly string[]>;
    echo: (message: string) => Promise<string>;
    countUp: (to: number) => AsyncGenerator<number>;
    notify: (message: string) => void;
    /** A NESTED sub-service — shimmed recursively across the boundary. */
    calc: {
        total: Observe<number>;
        add: (n: number) => Promise<number>;
        reset: () => void;
    };
}

export namespace SubService {
    export const schema = {
        type: "object",
        properties: {
            status: { type: "observe", value: { type: "string" } },
            inbox: { type: "observe", value: { type: "array", items: { type: "string" } } },
            echo: { type: "function", signature: { parameters: [{ type: "string" }], returns: { type: "promise", value: { type: "string" } } } },
            countUp: { type: "function", signature: { parameters: [{ type: "number" }], returns: { type: "generator", value: { type: "number" } } } },
            notify: { type: "function", signature: { parameters: [{ type: "string" }] } },
            calc: {
                type: "object",
                properties: {
                    total: { type: "observe", value: { type: "number" } },
                    add: { type: "function", signature: { parameters: [{ type: "number" }], returns: { type: "promise", value: { type: "number" } } } },
                    reset: { type: "function" },
                },
                required: ["total", "add", "reset"],
                additionalProperties: false,
            },
        },
        required: ["status", "inbox", "echo", "countUp", "notify", "calc"],
        additionalProperties: false,
    } as const satisfies Schema;
}

type _Valid = Assert<AsyncDataService.IsValid<SubService>>;
type _Complete = Assert<AsyncDataService.IsValidWithCompleteSchema<SubService, typeof SubService.schema>>;
