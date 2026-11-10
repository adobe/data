// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from "@adobe/ecs";
import type { position } from "./component.position.js";

/** `PositionComponent{}`. */
export const defaultPosition: Component<typeof position> = { x: 0, y: 0 };
