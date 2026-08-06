// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const setUserName = (t: CoreDatabase.Store, { name }: { name: string }) => {
  const next = State.setUserName(
    { userName: t.resources.userName, log: t.resources.log },
    { name },
  );
  t.resources.userName = next.userName;
  t.resources.log = next.log;
};
