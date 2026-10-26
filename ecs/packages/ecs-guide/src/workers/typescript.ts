// © 2026 Adobe. MIT License. See /LICENSE for details.
import { serve } from "./serve.js";

/** TypeScript's worker (`typescript-main.ts`), which says why when its modules fail to load. */
serve(() => import("./typescript-main.js"));
