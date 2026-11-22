// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { bindModelLooks } from "./plugin.thumbnails-view/system.bind-model-looks.js";

/** How each model looks, gathered as the document changes, for drawing its thumbnail. */
export const thumbnailsView: Plugin = { systems: [bindModelLooks] };
