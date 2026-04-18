// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";
import * as presentation from "./counter-display.presentation";

export function CounterDisplay() {
  const db = useDatabase(dashboardPlugin);
  const count = fromObserve(db.observe.resources.count, 0);

  return presentation.render({ count });
}
