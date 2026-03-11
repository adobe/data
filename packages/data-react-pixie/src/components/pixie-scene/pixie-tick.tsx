// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useTick } from "@pixi/react";
import { usePixieDatabase } from "../../state/use-pixie-database";

export function PixieTick() {
  const db = usePixieDatabase();
  useTick((ticker) => {
    db.transactions.tick(ticker.deltaTime);
  });
  return null;
}
