// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Phase } from "../types/phase/phase.js";

/**
 * Negotiation-only ECS plugin. All resources are `ephemeral: true` so they
 * are never replicated to peers (the negotiation DB itself is always
 * local-only, but the ephemeral flag is good documentation).
 *
 * The game role (userId) lives in the synced game DB, not here. After
 * `connected()` transitions the phase to "game", the negotiation element
 * mounts the game element with the synced DB already configured.
 */
export const negotiationPlugin = Database.Plugin.create({
    resources: {
        phase:       { default: "idle" as Phase,  ephemeral: true },
        offerCode:   { default: "" as string,     ephemeral: true },
        answerCode:  { default: "" as string,     ephemeral: true },
        bannerText:  { default: "" as string,     ephemeral: true },
        bannerError: { default: false as boolean, ephemeral: true },
    },
    transactions: {
        startHostSignaling(t) {
            t.resources.phase = "host-signaling";
            t.resources.bannerText = "Generating invite code — please wait…";
            t.resources.bannerError = false;
        },
        startJoinSignaling(t) {
            t.resources.phase = "join-signaling";
            t.resources.bannerText = "";
            t.resources.bannerError = false;
        },
        setOfferCode(t, { code }: { code: string }) {
            t.resources.offerCode = code;
            t.resources.bannerText = "";
        },
        setAnswerCode(t, { code }: { code: string }) {
            t.resources.answerCode = code;
            t.resources.bannerText = "";
        },
        setBanner(t, { text, error = false }: { text: string; error?: boolean }) {
            t.resources.bannerText = text;
            t.resources.bannerError = error;
        },
        /** Transitions to the game phase. Call after the synced game DB is ready. */
        connected(t) {
            t.resources.phase = "game";
        },
    },
});
