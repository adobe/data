import { syncedContainedCases } from "./synced-contained.cases.js";

// A real worker in chromium, over the fixture's source.
syncedContainedCases(() => import("./synced-contained.fixture.js"));
