// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";

export function StatusBar() {
  const db = useDatabase(dashboardPlugin);
  const userName = fromObserve(db.observe.resources.userName);
  const count = fromObserve(db.observe.resources.count);
  const log = fromObserve(db.observe.resources.log);

  return (
    <div class="status-bar">
      <span>{userName() ?? "Guest"}</span>
      <span>{(log() ?? []).length} actions</span>
      <span>Count: {count() ?? 0}</span>
    </div>
  );
}
