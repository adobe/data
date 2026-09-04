// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Observe } from "@adobe/data/observe";
import { type Schema } from "@adobe/data/schema";
import { AsyncDataService, type Service } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";

/**
 * The service the MAIN frame exposes to the SUB frame. It carries one member of
 * every kind so the sub can exercise observe / promise / generator / void
 * against the main:
 *  - `time`    OBSERVE   — the main's clock; the sub renders it live.
 *  - `logs`    OBSERVE   — messages the main received (written by the sub via `log`).
 *  - `echo`    PROMISE   — request/response.
 *  - `countUp` GENERATOR — a pull-based stream.
 *  - `log`     VOID      — fire-and-forget; its effect shows up in `logs`.
 */
export interface MainService extends Service {
    time: Observe<number>;
    logs: Observe<readonly string[]>;
    echo: (message: string) => Promise<string>;
    countUp: (to: number) => AsyncGenerator<number>;
    log: (message: string) => void;
}

export namespace MainService {
    export const schema = {
        type: "object",
        properties: {
            time: { type: "observe", value: { type: "number" } },
            logs: { type: "observe", value: { type: "array", items: { type: "string" } } },
            echo: { type: "function", signature: { parameters: [{ type: "string" }], returns: { type: "promise", value: { type: "string" } } } },
            countUp: { type: "function", signature: { parameters: [{ type: "number" }], returns: { type: "generator", value: { type: "number" } } } },
            log: { type: "function", signature: { parameters: [{ type: "string" }] } },
        },
        required: ["time", "logs", "echo", "countUp", "log"],
        additionalProperties: false,
    } as const satisfies Schema;
}

// Compile-time proof the contract is a valid AsyncDataService fully described by its schema.
type _Valid = Assert<AsyncDataService.IsValid<MainService>>;
type _Complete = Assert<AsyncDataService.IsValidWithCompleteSchema<MainService, typeof MainService.schema>>;
