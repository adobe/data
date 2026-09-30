// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { components } from "../data/components/index.js";

import { cases as addUser } from "./add-user.cases.js";
import { cases as assignUser } from "./assign-user.cases.js";
import { cases as unassignUser } from "./unassign-user.cases.js";
import { cases as users } from "./users.cases.js";
import { cases as tasksByUser } from "./tasks-by-user.cases.js";

// The assign feature's spec. `schemas` lets the runner find entity references.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  schemas: components,
  cases: { addUser, assignUser, unassignUser, users, tasksByUser },
});
