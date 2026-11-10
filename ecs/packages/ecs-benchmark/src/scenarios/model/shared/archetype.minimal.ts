// © 2026 Adobe. MIT License. See /LICENSE for details.
import { position } from "./component.position.js";
import { velocity } from "./component.velocity.js";

/** What `EntityFactory::createMinimal` makes: components one and two. */
export const Minimal = [position, velocity] as const;
