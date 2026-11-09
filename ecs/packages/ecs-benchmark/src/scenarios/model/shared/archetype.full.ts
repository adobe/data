// © 2026 Adobe. MIT License. See /LICENSE for details.
import { data } from "./component.data.js";
import { position } from "./component.position.js";
import { velocity } from "./component.velocity.js";

/** What `EntityFactory::create` makes: components one, two and three. */
export const Full = [position, velocity, data] as const;
