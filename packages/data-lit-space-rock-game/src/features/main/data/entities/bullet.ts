// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { Assert, Equal } from "@adobe/data/types";
import type { components } from "../components/index.js";
import type { Bullet as BulletValue } from "../values/bullet/bullet.js";

// A bullet: its row is exactly the `Bullet` value.
export const Bullet = ["position", "velocity", "age"] as const satisfies Database.EntityComponents<typeof components>;
export type Bullet = Database.EntityType<typeof components, typeof Bullet>;

type _Pin = Assert<Equal<Bullet, BulletValue>>;
