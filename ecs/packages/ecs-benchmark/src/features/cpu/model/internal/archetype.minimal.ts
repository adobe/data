// © 2026 Adobe. MIT License. See /LICENSE for details.
import { position, velocity } from "../../../../model/index.js";

/** What `EntityFactory::createMinimal` makes: components one and two. */
export const Minimal = [position, velocity] as const;
