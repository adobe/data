// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import { transitions } from "./transitions.js";
import { MainService } from "../../services/main-service/main-service.js";

// The single pure-spec test for every transform AND derivation in this folder.
// `runSpec` auto-discovers each module in `transitions` that exports `cases`,
// requires it to export exactly its function plus `cases`, and dispatches on case
// shape. Each case's `before`/`input` is a delta over `State.create()`. The `plugin`
// is passed because `State` carries a reference singleton (`selectedTodo`): the pure
// comparison reads its `Entity.schema` mark from the plugin to bijection-match that
// reference, the same way the ecs side does.
Conformance.runSpec({ state: State, transitions, plugin: MainService.plugin });
