// © 2026 Adobe. MIT License. See /LICENSE for details.
import { runMessageOf } from "../../run/protocol.js";
import { all, on, type Connect } from "../../shared/connect.js";
import { openSystem, receiveChecked, receiveCompiled, receiveRetrying, receiveRun, selectTab } from "./model.js";

export const connect: Connect = (world, root) => all(
    on(root, "guide-checked", event => void world.run(receiveChecked, event.detail)),
    on(root, "guide-retrying", event => void world.run(receiveRetrying, { chapter: event.detail.chapter, revision: event.detail.revision })),
    on(root, "guide-compiled", event => void world.run(receiveCompiled, event.detail)),
    on(root, "guide-select-tab", event => void world.run(selectTab, { tab: event.detail.tab })),
    on(root, "guide-open-system", event => void world.run(openSystem, { file: event.detail.file, start: event.detail.start })),
    on(root, "guide-run", event => {
        const message = runMessageOf(event.detail.message);
        if (message !== null) void world.run(receiveRun, { message });
    }),
);
