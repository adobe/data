// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from "@adobe/ecs";
import type { damage } from "./component.damage.js";
import type { health } from "./component.health.js";
import type { player } from "./component.player.js";
import type { position } from "./component.position.js";
import type { sprite } from "./component.sprite.js";

/** The values `HeroMonsterEntityFactory::setComponents` sets. */
export type HeroMonsterValues = {
    readonly position: Component<typeof position>;
    readonly player: Component<typeof player>;
    readonly health: Component<typeof health>;
    readonly damage: Component<typeof damage>;
    readonly sprite: Component<typeof sprite>;
};
