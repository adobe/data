// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Generator } from "./internal/type.generator.js";

/** An entity's components, each present or not. */
export type Reference = {
    position?: Position;
    velocity?: Position;
    data?: Data;
    player?: Player;
    health?: Health;
    damage?: Damage;
    sprite?: Sprite;
};

type Position = { x: number; y: number };
type Data = { thingy: number; dingy: number; mingy: boolean; seed: number; rng: Generator; numgy: number };
type Player = { rng: Generator; type: number };
type Health = { hp: number; maxhp: number; status: number };
type Damage = { atk: number; def: number };
type Sprite = { character: number };
