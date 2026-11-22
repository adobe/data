// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { layer } from "../../../materials/model/index.js";
import { root } from "../../../../view/index.js";

/**
 * Shows the mode editing is in, as it changes: the root's `data-layer`, which the page styles from.
 */
export const bindLayer: System = System.create({
    readonly: true,
    resources: { is: [root], changed: [root, layer] },
}, ({ resources }) => {
    const page = resources[root];
    const mode = resources[layer];
    if (page.dataset["layer"] !== mode) page.dataset["layer"] = mode;
});
