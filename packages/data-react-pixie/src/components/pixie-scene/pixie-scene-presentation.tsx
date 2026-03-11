// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Filter } from "pixi.js";
import { Sprite } from "../sprite/sprite";

export function render(args: {
  filters: Filter[];
  sprites: readonly number[];
}) {
  const { filters, sprites } = args;
  return (
    <pixiContainer filters={filters}>
      {sprites.map((entity) => (
        <Sprite key={entity} entity={entity} />
      ))}
    </pixiContainer>
  );
}
