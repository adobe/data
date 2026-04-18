// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";
import * as presentation from "./control-panel.presentation";

export function ControlPanel() {
  const db = useDatabase(dashboardPlugin);
  const count = fromObserve(db.observe.resources.count);

  return presentation.render({
    get count() { return count() ?? 0; },
    increment: db.transactions.increment,
    decrement: db.transactions.decrement,
    reset: db.transactions.reset,
    setUserName: db.transactions.setUserName,
  });
}
