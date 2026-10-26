// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { readFileSync } from 'node:fs';

const manifest: unknown = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
const version: unknown = typeof manifest === "object" && manifest !== null ? Reflect.get(manifest, "version") : undefined;

/** The id of a binding of one of the package's own modules, as the build gives it: its name and current version first. */
export const ownId = (path: string, binding: string): string => `@adobe/ecs@${String(version)}/${path}#${binding}`;
