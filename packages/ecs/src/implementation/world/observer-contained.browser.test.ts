// © 2026 Adobe. MIT License. See /LICENSE for details.
import { observerContainedCases } from "./observer-contained.cases.js";

// A real worker in chromium, over the fixture's source.
observerContainedCases(() => import("./observer-contained.fixture.js"));
