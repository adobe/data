// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "@adobe/data/observe";
import { MainService } from "../shared/main-service.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The MAIN frame's local implementation of {@link MainService}. */
export function createMainService(): MainService {
    const [time, setTime] = Observe.createState(0);
    const [logs, setLogs] = Observe.createState<readonly string[]>([]);

    let ticks = 0;
    setInterval(() => setTime((ticks += 1)), 1000);

    let received: readonly string[] = [];

    return {
        serviceName: "main",
        schema: Observe.fromConstant(MainService.schema),
        time,
        logs,
        echo: async (message) => `main echoes: ${message}`,
        countUp: async function* (to) {
            for (let i = 1; i <= to; i++) {
                await delay(300);
                yield i;
            }
        },
        log: (message) => setLogs((received = [...received, message])),
    };
}
