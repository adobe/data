// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";
import * as presentation from "./control-panel.presentation";

export function ControlPanel() {
  const db = useDatabase(dashboardPlugin);
  const count = fromObserve(db.observe.resources.count, 0);
  const { increment, decrement, reset, setUserName } = db.transactions;

  return presentation.render({ count, increment, decrement, reset, setUserName });
}
