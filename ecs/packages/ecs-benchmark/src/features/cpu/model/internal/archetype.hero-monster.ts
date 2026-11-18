// © 2026 Adobe. MIT License. See /LICENSE for details.
import { damage, data, health, player, position, sprite, velocity } from "../../../../model/index.js";

/** `Full` with what `HeroMonsterEntityFactory::addComponents` adds. */
export const HeroMonster = [position, velocity, data, player, health, damage, sprite] as const;
