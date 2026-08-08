// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { MainService } from "../../services/main-service/main-service.js";
import * as presentation from "./activity-log.presentation.jsx";

export function ActivityLog() {
  const db = useDatabase(MainService.plugin);
  const log = fromObserve(db.observe.resources.log, []);
  const { clearLog } = db.transactions;

  return presentation.render({ log, clearLog });
}
