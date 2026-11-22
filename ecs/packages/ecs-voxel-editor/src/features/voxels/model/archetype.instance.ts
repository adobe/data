// © 2026 Adobe. MIT License. See /LICENSE for details.
import { instance } from "./component.instance.js";
import { instanceOf } from "./component.instance-of.js";
import { parent } from "./component.parent.js";
import { position } from "./component.position.js";
import { rotation } from "./component.rotation.js";

/** What an instance spawns with. */
export const Instance = [instance, instanceOf, parent, position, rotation] as const;
