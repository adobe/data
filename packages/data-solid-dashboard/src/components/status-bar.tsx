// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createMemo } from "solid-js";
import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";
import * as presentation from "./status-bar.presentation";

export function StatusBar() {
  const db = useDatabase(dashboardPlugin);
  const userName = fromObserve(db.observe.resources.userName, "Guest");
  const count = fromObserve(db.observe.resources.count, 0);
  const log = fromObserve(db.observe.resources.log, [] as readonly string[]);
  const actionCount = createMemo(() => log().length);

  return presentation.render({ userName, actionCount, count });
}
