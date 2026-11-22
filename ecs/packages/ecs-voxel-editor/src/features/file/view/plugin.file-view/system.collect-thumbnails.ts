// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { modelLooks, thumbnailUrl } from "../../../thumbnails/view/index.js";

/** Each model's thumbnail, by name, to save with it. */
export const collectThumbnails: System<void, readonly (readonly [string, string])[]> = System.create({ readonly: true }, ({ resources }) =>
    [...resources[modelLooks]?.values() ?? []].map(look => [look.name, thumbnailUrl(look)] as const));
