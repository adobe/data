// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { cases as movePresence } from "./move-presence.cases.js";

// The presence spec. No services (the peer `mark` is the ambient transaction
// `userId`, not an injected service), no derivations, no entity references.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  cases: { movePresence },
});
