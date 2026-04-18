// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";
import * as presentation from "./status-bar.presentation";

export function StatusBar() {
  const db = useDatabase(dashboardPlugin);
  const userName = fromObserve(db.observe.resources.userName);
  const count = fromObserve(db.observe.resources.count);
  const log = fromObserve(db.observe.resources.log);

  return presentation.render({
    get userName() { return userName() ?? "Guest"; },
    get actionCount() { return (log() ?? []).length; },
    get count() { return count() ?? 0; },
  });
}
