// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AnalyticsService } from "./analytics-service/analytics-service.js";
import type { NameGeneratorService } from "./name-generator-service/name-generator-service.js";

// The feature's injectable capability services, keyed by short name (the service
// name minus its `-service` suffix). A transition injects the ones it needs with
// `Pick<Services, "analytics" | …>`, so the key and its type come from one place
// and can't drift per-transition. The ecs `service-database` registers these same
// keys and is pinned to this map (see its drift-guard).
export type Services = {
  readonly analytics: AnalyticsService;
  readonly nameGenerator: NameGeneratorService;
};
