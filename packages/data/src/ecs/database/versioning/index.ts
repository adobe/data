// © 2026 Adobe. MIT License. See /LICENSE for details.

export type { VersionEntry } from "./version-entry.js";
export { foldSchemas, type VersionSchemas } from "./fold-schemas.js";
export { conformStoreToSchemas } from "./conform-store-to-schemas.js";
export { createVersionUpgrader } from "./create-version-upgrader.js";
export { assertVersionsMatchSchema } from "./assert-versions-match-schema.js";
export { createStoreAtVersion, runUpgradeStep } from "./run-upgrade-step.js";
