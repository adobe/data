// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { schema } from "./schema";

import bunnyUrl from "./bunny.png";
import foxUrl from "./fox.png";

type SpriteType = Schema.ToType<typeof schema>;

export const image = {
  bunny: bunnyUrl,
  fox: foxUrl,
} as const satisfies Record<SpriteType, string>;
