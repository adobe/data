// © 2026 Adobe. MIT License. See /LICENSE for details.
import { serve } from "./serve.js";

/** The compiler's worker (`compiler-main.ts`), which says why when its modules fail to load. */
serve(() => import("./compiler-main.js"));
