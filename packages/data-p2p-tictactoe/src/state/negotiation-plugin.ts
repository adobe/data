// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { PlayerMark } from "../types/player-mark/player-mark.js";
import type { Phase } from "../types/phase/phase.js";

export const negotiationPlugin = Database.Plugin.create({
    resources: {
        phase:       { default: "idle" as Phase,         ephemeral: true },
        offerCode:   { default: "" as string,            ephemeral: true },
        answerCode:  { default: "" as string,            ephemeral: true },
        bannerText:  { default: "" as string,            ephemeral: true },
        bannerError: { default: false as boolean,        ephemeral: true },
        myMark:      { default: null as PlayerMark | null, ephemeral: true },
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
        connected(t, { myMark }: { myMark: PlayerMark }) {
            t.resources.myMark = myMark;
            t.resources.phase = "game";
        },
    },
});
