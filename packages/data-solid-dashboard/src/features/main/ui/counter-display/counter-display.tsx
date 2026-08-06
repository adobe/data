// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { MainService } from "../../services/main-service/main-service.js";
import * as presentation from "./counter-display.presentation.jsx";

export function CounterDisplay() {
  const db = useDatabase(MainService.plugin);
  const count = fromObserve(db.observe.resources.count, 0);

  return presentation.render({ count });
}
