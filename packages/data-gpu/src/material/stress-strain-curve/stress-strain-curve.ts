import { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import { schema } from "./schema.js";

export type StressStrainCurve = Schema.ToType<typeof schema>;

type _StressStrainCurveMatchesSchema = Assert<
    Equal<StressStrainCurve, Schema.ToType<typeof schema>>
>;

export * as StressStrainCurve from "./public.js";
