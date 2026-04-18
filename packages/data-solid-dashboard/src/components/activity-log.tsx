// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";
import * as presentation from "./activity-log.presentation";

export function ActivityLog() {
  const db = useDatabase(dashboardPlugin);
  const log = fromObserve(db.observe.resources.log, []);
  const { clearLog } = db.transactions;

  return presentation.render({ log, clearLog });
}
