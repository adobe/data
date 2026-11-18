// © 2026 Adobe. MIT License. See /LICENSE for details.
import { data, position, velocity } from "../../../../model/index.js";

/** What `EntityFactory::create` makes: components one, two and three. */
export const Full = [position, velocity, data] as const;
