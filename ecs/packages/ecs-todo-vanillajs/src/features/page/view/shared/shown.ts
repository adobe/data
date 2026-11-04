// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/ecs";

/** The key an element holds the entity it shows under: only `attach` writes it. */
export const shown: unique symbol = Symbol("shown");

/** An element showing an entity. */
export type Attached = { readonly [shown]: Entity };

/** The entity a target shows, or none for one that shows none. */
export const shownBy = (target: EventTarget | Attached | null): Entity => target !== null && shown in target ? target[shown] : Entity.none;
