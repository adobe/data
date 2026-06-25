// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FromArchetype, Entity } from "@adobe/data/ecs";
import type { TrackService } from "../fixture/dist/service.js";
declare const svc: TrackService;
const has: boolean = svc.archetypes.Track.components.has("trackKind");
type Row = FromArchetype<TrackService["archetypes"]["Track"]>;
type Expected = { readonly id: Entity; readonly trackKind: string; readonly editingMode: string; readonly muted: boolean };
declare const row: Row; declare const expected: Expected;
const a: Expected = row; const b: Row = expected;
void [has, a, b];
