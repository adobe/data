// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/schema";
import { Vec3 } from "@adobe/data/math";
import { JointType } from "./joint-type/joint-type.js";

/**
 * jointData — the solver-agnostic constraint data model. A `Joint` connects two
 * bodies (`jointBodyA`/`jointBodyB`, any solver's bodies) with anchors in each
 * body's local frame; the active solver mirrors each joint into its engine once
 * both bodies exist (tag + exclude, like body sync). Authored only — no systems.
 *
 * Independent of `physicsData` (it only references bodies by `Entity`), so a
 * solver `combine`s both. See `joint.ts` for the row type and `README.md` for
 * the roadmap (joints are the ragdoll prerequisite).
 */
export const jointData = Database.Plugin.create({
    components: {
        jointType:     JointType.schema,
        jointBodyA:    Entity.schema,
        jointBodyB:    Entity.schema,
        jointAnchorA:  Vec3.schema,   // anchor on body A, A-local
        jointAnchorB:  Vec3.schema,   // anchor on body B, B-local
        jointAxis:     Vec3.schema,   // hinge/cone reference axis (A-local); unused for fixed/point
        jointMinLimit: F32.schema,    // hinge angle / cone twist lower bound (rad); min >= max ⇒ no limit
        jointMaxLimit: F32.schema,    // hinge angle / cone twist upper bound (rad)
        jointSwingLimit: F32.schema,  // cone swing half-angle (rad); cone only
    },
    archetypes: {
        Joint: ["jointType", "jointBodyA", "jointBodyB", "jointAnchorA", "jointAnchorB", "jointAxis", "jointMinLimit", "jointMaxLimit", "jointSwingLimit"],
    },
});
