// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Imperative state machine wrapping signaling + sync wiring + game DB
// construction. Pumps results into a negotiation database via transactions
// so the UI can render purely from observable state.

import { Database } from "@adobe/data/ecs";
import { createSyncServer, createSyncService, createLoopbackTransport, type SyncService } from "@adobe/data-sync";
import { startHostSignaling, startJoinerSignaling } from "../signaling.js";
import { negotiationPlugin } from "./negotiation-plugin.js";

type NegotiationDatabase = Database.Plugin.ToDatabase<typeof negotiationPlugin>;

/**
 * Per-instance configuration the negotiation element injects when it
 * builds a controller. The plugin / userId mapping live here because they
 * are necessarily game-specific and cannot be encoded into the negotiation
 * plugin itself.
 */
export interface NegotiationConfig {
    readonly gamePlugin: Database.Plugin<any, any, any, any, any, any, any, any>;
    readonly assignUserId: (role: "host" | "joiner") => string;
}

export interface NegotiationController {
    startHost(): void;
    startJoin(): void;
    /** Submit the value currently in `hostAnswerInput` to the host signaling flow. */
    submitAnswer(): void;
    /** Begin joiner signaling using the value currently in `joinerOfferInput`. */
    generateAnswer(): void;
    copyText(text: string): void;
    dispose(): void;
}

/**
 * Creates a controller bound to the supplied negotiation database. The
 * controller writes to the database via transactions, so consumers only
 * need to subscribe to that database to render reactive UI.
 *
 * The controller intentionally retains its own closure-scoped procedural
 * state (signaling promises, sync server / service handles). That state
 * is not appropriate for ECS resources because it is non-serialisable
 * and tied to per-instance browser objects (`RTCPeerConnection`).
 */
export const createNegotiationController = (
    db: NegotiationDatabase,
    config: NegotiationConfig,
): NegotiationController => {
    let submitHostAnswer: ((code: string) => void) | undefined;
    let joinStarted = false;
    let syncService: SyncService | undefined;
    let syncServer: ReturnType<typeof createSyncServer> | undefined;

    const reportError = (text: string, err: unknown) =>
        db.transactions.setBanner({ text: `${text}: ${String(err)}`, error: true });

    const wireGameDb = (
        userId: string,
        wireSync: (gameDb: Database<any, any, any, any, any, any, any, any>) => void,
    ) => {
        const gameDb = Database.create(config.gamePlugin, { sync: { userId } });
        wireSync(gameDb);
        db.transactions.setGameDb({ gameDb });
    };

    const startHost = () => {
        db.transactions.startHostSignaling();

        const { offerCode, submitAnswer, connected } = startHostSignaling();
        submitHostAnswer = submitAnswer;

        offerCode
            .then((code) => db.transactions.setOfferCode({ code }))
            .catch((err: unknown) => reportError("Error generating offer", err));

        connected
            .then((serverTransport) => {
                wireGameDb(config.assignUserId("host"), (gameDb) => {
                    const { client: loopbackClient, server: loopbackServer } = createLoopbackTransport();
                    syncServer = createSyncServer();
                    syncServer.connect(serverTransport);
                    syncServer.connect(loopbackServer);
                    syncService = createSyncService({ database: gameDb, transport: loopbackClient });
                });
            })
            .catch((err: unknown) => reportError("Connection failed", err));
    };

    const startJoin = () => {
        db.transactions.startJoinSignaling();
    };

    const submitAnswer = () => {
        const code = db.resources.hostAnswerInput.trim();
        if (code && submitHostAnswer) {
            submitHostAnswer(code);
        }
    };

    const generateAnswer = () => {
        const offerCodeFromHost = db.resources.joinerOfferInput.trim();
        if (joinStarted || !offerCodeFromHost) return;
        joinStarted = true;
        db.transactions.setBanner({ text: "Generating answer — please wait…" });

        const { answerCode, connected } = startJoinerSignaling(offerCodeFromHost);

        answerCode
            .then((code) => db.transactions.setAnswerCode({ code }))
            .catch((err: unknown) => reportError("Error creating answer", err));

        connected
            .then((clientTransport) => {
                wireGameDb(config.assignUserId("joiner"), (gameDb) => {
                    syncService = createSyncService({ database: gameDb, transport: clientTransport });
                });
            })
            .catch((err: unknown) => reportError("Connection failed", err));
    };

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text).catch(() => undefined);
    };

    const dispose = () => {
        syncService?.dispose();
        syncServer?.dispose();
    };

    return { startHost, startJoin, submitAnswer, generateAnswer, copyText, dispose };
};
