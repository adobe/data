import type { Feature } from "../../shared/feature.js";
import { defineTodoGenerate } from "./elements/todo-generate.js";
import { connect } from "./events.js";

/** Generating: adding many todos at once, to try the app at scale. Its element drives nothing, so it has no DOM systems. */
export const generate: Feature = {
    define: defineTodoGenerate,
    resources: () => ({}),
    systems: [],
    connect,
};
