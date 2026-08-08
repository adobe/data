// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createMemo } from "solid-js";
import { fromObserve, useDatabase } from "@adobe/data-solid";
import { MainService } from "../../services/main-service/main-service.js";
import * as presentation from "./status-bar.presentation.jsx";

export function StatusBar() {
  const db = useDatabase(MainService.plugin);
  const userName = fromObserve(db.observe.resources.userName, "Guest");
  const count = fromObserve(db.observe.resources.count, 0);
  const log = fromObserve(db.observe.resources.log, []);
  const actionCount = createMemo(() => log().length);

  return presentation.render({ userName, actionCount, count });
}
