// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { MainService } from "../../services/main-service/main-service.js";
import * as presentation from "./control-panel.presentation.jsx";

export function ControlPanel() {
  const db = useDatabase(MainService.plugin);
  const count = fromObserve(db.observe.resources.count, 0);
  const { increment, decrement, reset, setUserName } = db.transactions;
  const setName = (name: string) => setUserName({ name });

  return presentation.render({ count, increment, decrement, reset, setUserName: setName });
}
