// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useTick } from "@pixi/react";
import { useMainService } from "../use-main-service.js";

export function PixieTick() {
  const db = useMainService();
  useTick((ticker) => {
    db.transactions.tick({ delta: ticker.deltaTime });
  });
  return null;
}
