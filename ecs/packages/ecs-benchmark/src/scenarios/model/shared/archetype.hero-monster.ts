// © 2026 Adobe. MIT License. See /LICENSE for details.
import { damage } from "./component.damage.js";
import { data } from "./component.data.js";
import { health } from "./component.health.js";
import { player } from "./component.player.js";
import { position } from "./component.position.js";
import { sprite } from "./component.sprite.js";
import { velocity } from "./component.velocity.js";

/** `Full` with what `HeroMonsterEntityFactory::addComponents` adds. */
export const HeroMonster = [position, velocity, data, player, health, damage, sprite] as const;
