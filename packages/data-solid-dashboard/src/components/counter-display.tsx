// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";

export function CounterDisplay() {
  const db = useDatabase(dashboardPlugin);
  const count = fromObserve(db.observe.resources.count);

  return (
    <div class="counter-display">
      <span class="count-value">{count() ?? 0}</span>
    </div>
  );
}
