// © 2026 Adobe. MIT License. See /LICENSE for details.
import { scopeChannel } from "./port.js";
import { lentWorkers } from "./worker-platform.js";
import { simulate } from "./workers.fixture.js";
import type { FromHost, ToHost } from "./ports.fixture.js";

/** A worker holding a world: runs `simulate(3)` with nested workers or ones its parent lent, and posts the result. */
const channel = scopeChannel<FromHost, ToHost>();
channel.onMessage(async message => {
    channel.post(await simulate(3, true, false, message.kind === "lent" ? lentWorkers(message.lent) : undefined));
});
