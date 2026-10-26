// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Feature } from "../shared/feature.js";
import { appearance } from "./appearance/feature.js";
import { builds } from "./builds/feature.js";
import { chapters } from "./chapters/feature.js";
import { examples } from "./examples/feature.js";

/** The guide's features, each after those it builds on, as the app starts them. */
export const features: readonly Feature[] = [chapters, examples, builds, appearance];
