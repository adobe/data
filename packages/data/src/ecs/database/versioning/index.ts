// © 2026 Adobe. MIT License. See /LICENSE for details.

export type { VersionEntry } from "./version-entry.js";
export { foldSchemas, type VersionSchemas } from "./fold-schemas.js";
export { conformStoreToSchemas } from "./conform-store-to-schemas.js";
export { createVersionUpgrader, type VersionResources } from "./create-version-upgrader.js";
export { assertVersionsMatchSchema } from "./assert-versions-match-schema.js";
export { assertVersioning } from "./assert-versioning.js";
export { createStoreAtVersion, runUpgradeStep } from "./run-upgrade-step.js";
export { testUpgradeHandlers, type UpgradeHandlerTest } from "./test-upgrade-handlers.js";
