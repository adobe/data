// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from "@adobe/ecs";
import type { velocity } from "./component.velocity.js";

/** `VelocityComponent{}`. */
export const defaultVelocity: Component<typeof velocity> = { x: 1, y: 1 };
