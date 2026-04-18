// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";
import * as presentation from "./counter-display.presentation";

export function CounterDisplay() {
  const db = useDatabase(dashboardPlugin);
  const count = fromObserve(db.observe.resources.count);

  return presentation.render({
    get count() { return count() ?? 0; },
  });
}
