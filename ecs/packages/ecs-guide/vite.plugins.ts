// © 2026 Adobe. MIT License. See /LICENSE for details.
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { guidePackages } from "./guide-packages.ts";

/**
 * The plugins the guide's pages and workers build with besides the ECS's: what a server or build serving the guide
 * among other pages takes too, as the sample browser does.
 */
export const plugins = (): Plugin[] => [guidePackages(fileURLToPath(new URL(".", import.meta.url)))];
