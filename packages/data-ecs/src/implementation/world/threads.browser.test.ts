import { workersCases } from "./workers.cases.js";
import { layoutDirectoryCases } from "./layout-directory.cases.js";
import { poolCases } from "./pool.cases.js";
import { poolSizeCases } from "./pool-size.cases.js";
import { dispatchCases } from "./dispatch.cases.js";
import { reductionsCases } from "./reductions.cases.js";
import { observedWorkersCases } from "./observed-workers.cases.js";
import { upWorkersCases } from "./up-workers.cases.js";
import { portsCases } from "./ports.cases.js";
import { commandRingsCases } from "./command-rings.cases.js";
import { joiningCases } from "./joining.cases.js";

// Real workers in chromium: the cases over the fixtures' sources, as node runs them built.
workersCases(() => import("./workers.fixture.js"));
layoutDirectoryCases(() => import("./layout-directory.fixture.js"));
poolCases(() => import("./pool.fixture.js"));
poolSizeCases(() => import("./pool-size.fixture.js"));
dispatchCases(() => import("./dispatch.fixture.js"));
reductionsCases(() => import("./reductions.fixture.js"));
observedWorkersCases(() => import("./observed-workers.fixture.js"));
upWorkersCases(() => import("./up-workers.fixture.js"));
portsCases(() => import("./ports.fixture.js"));
commandRingsCases(() => import("./command-rings.fixture.js"));
joiningCases(() => import("./joining.fixture.js"));
