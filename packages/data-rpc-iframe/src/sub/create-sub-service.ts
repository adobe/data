// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "@adobe/data/observe";
import { SubService } from "../shared/sub-service.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const STATUSES = ["idle", "working", "syncing", "ready"] as const;

/** The SUB frame's local implementation of {@link SubService}. */
export function createSubService(): SubService {
    const [status, setStatus] = Observe.createState<string>(STATUSES[0]);
    const [inbox, setInbox] = Observe.createState<readonly string[]>([]);

    let i = 0;
    setInterval(() => setStatus(STATUSES[(i += 1) % STATUSES.length]), 1500);

    let received: readonly string[] = [];

    // Nested sub-service state.
    const [total, setTotal] = Observe.createState(0);
    let runningTotal = 0;

    return {
        serviceName: "sub",
        schema: Observe.fromConstant(SubService.schema),
        status,
        inbox,
        echo: async (message) => `sub echoes: ${message}`,
        countUp: async function* (to) {
            for (let n = 1; n <= to; n++) {
                await delay(300);
                yield n;
            }
        },
        notify: (message) => setInbox((received = [...received, message])),
        calc: {
            total,
            add: async (n) => {
                setTotal((runningTotal += n));
                return runningTotal;
            },
            reset: () => setTotal((runningTotal = 0)),
        },
    };
}
