// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Imperative state machine wrapping signaling + sync wiring + game DB
// construction. Pumps results into a negotiation database via transactions
// so the UI can render purely from observable state.

import { Database, createRebaseReplayConcurrency } from "@adobe/data/ecs";
import { createSyncServer, createSyncService, createLoopbackTransport, type SyncService } from "@adobe/data-sync";
import { startHostSignaling, startJoinerSignaling, type HostConnection, type JoinerConnection } from "../signaling.js";
import { createRenegotiator, type Renegotiator } from "../renegotiator.js";
import { negotiationPlugin } from "./negotiation-plugin.js";

type NegotiationDatabase = Database.Plugin.ToDatabase<typeof negotiationPlugin>;
type GameDb = Database<any, any, any, any, any, any, any, any>;

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
    /** Attempt to re-establish a dropped P2P connection via manual re-signaling. */
    reconnect(): void;
    dispose(): void;
}

const log = (msg: string) => console.log(`[negotiation] ${msg}`);
const syncLog = (msg: string) => console.log(`[sync] ${msg}`);
const serverLog = (msg: string) => console.log(`[sync-server] ${msg}`);
const renegLog = (msg: string) => console.log(`[reneg] ${msg}`);

/**
 * Creates a controller bound to the supplied negotiation database. The
 * controller writes to the database via transactions, so consumers only
 * need to subscribe to that database to render reactive UI.
 *
 * The controller intentionally retains its own closure-scoped procedural
 * state (signaling promises, sync server / service handles, peer-connection
 * + renegotiator handles). That state is not appropriate for ECS resources
 * because it is non-serialisable and tied to per-instance browser objects.
 */
export const createNegotiationController = (
    db: NegotiationDatabase,
    config: NegotiationConfig,
): NegotiationController => {
    let submitHostAnswer: ((code: string) => void) | undefined;
    let joinStarted = false;
    let syncService: SyncService | undefined;
    let syncServer: ReturnType<typeof createSyncServer> | undefined;
    // Retained for reconnect: the game DB and accumulated watermark.
    let gameDb: GameDb | undefined;
    // Retained for ICE restart: the live PC and renegotiator. Replaced on
    // every successful (re)connect; cleared on full close.
    let pc: RTCPeerConnection | undefined;
    let renegotiator: Renegotiator | undefined;

    const reportError = (text: string, err: unknown) =>
        db.transactions.setBanner({ text: `${text}: ${String(err)}`, error: true });

    const onTransportClose = () => {
        log(`transport close observed; current connection=${db.resources.connection}`);
        if (db.resources.connection === "connected" || db.resources.connection === "reconnecting") {
            db.transactions.setConnection({ state: "disconnected" });
        }
    };

    /**
     * Wires the lifecycle of a freshly negotiated peer connection: replaces
     * the retained `pc`/`renegotiator`, listens for connection-state
     * degradation, and triggers ICE restart on the host side when the path
     * goes "disconnected" — a transient state where the existing channels
     * may still deliver renegotiation messages. If the path subsequently
     * goes "failed" the existing transport-close path takes over.
     */
    const wirePeerConnection = (newPc: RTCPeerConnection, signalChannel: RTCDataChannel, role: "host" | "joiner") => {
        renegotiator?.dispose();
        pc = newPc;
        renegotiator = createRenegotiator(newPc, signalChannel, role, renegLog);

        newPc.addEventListener("connectionstatechange", () => {
            log(`pc.connectionState=${newPc.connectionState}`);
            if (newPc.connectionState === "disconnected" && role === "host") {
                renegotiator?.triggerIceRestart().catch((err) =>
                    log(`triggerIceRestart rejected: ${String(err)}`),
                );
            }
        });
        newPc.addEventListener("iceconnectionstatechange", () => {
            log(`pc.iceConnectionState=${newPc.iceConnectionState}`);
        });
    };

    const wireHostSync = (serverTransport: HostConnection["transport"]) => {
        const priorSessionId = syncService?.sessionId();
        const initialWatermark = syncService?.lastAppliedTime() ?? 0;
        syncService?.dispose();

        const { client: loopbackClient, server: loopbackServer } = createLoopbackTransport();
        if (!syncServer) {
            syncServer = createSyncServer({ logger: serverLog });
        }
        syncServer.connect(serverTransport);
        syncServer.connect(loopbackServer);
        syncService = createSyncService({
            database: gameDb!,
            transport: loopbackClient,
            priorSessionId,
            initialWatermark,
            logger: syncLog,
            onWelcome: ({ resetRequired }) => {
                if (resetRequired) {
                    log(`welcome.resetRequired=true → resetting game DB`);
                    gameDb!.reset();
                }
            },
        });

        serverTransport.onClose(onTransportClose);
        db.transactions.setConnection({ state: "connected", sessionId: syncServer.sessionId });
    };

    const wireJoinerSync = (clientTransport: JoinerConnection["transport"]) => {
        const priorSessionId = syncService?.sessionId();
        const initialWatermark = syncService?.lastAppliedTime() ?? 0;
        syncService?.dispose();

        syncService = createSyncService({
            database: gameDb!,
            transport: clientTransport,
            priorSessionId,
            initialWatermark,
            logger: syncLog,
            onWelcome: ({ sessionId, resetRequired }) => {
                if (resetRequired) {
                    log(`welcome.resetRequired=true → resetting game DB`);
                    gameDb!.reset();
                }
                db.transactions.setConnection({ state: "connected", sessionId });
            },
        });

        clientTransport.onClose(onTransportClose);
    };

    const wireGameDb = (
        userId: string,
        wireSync: () => void,
    ) => {
        if (!gameDb) {
            log(`creating game DB for userId=${userId}`);
            gameDb = Database.create(config.gamePlugin, { concurrency: createRebaseReplayConcurrency(userId) });
        }
        wireSync();
        db.transactions.setGameDb({ gameDb });
    };

    const startHost = () => {
        log(`startHost`);
        db.transactions.startHostSignaling();

        const { offerCode, submitAnswer, connected } = startHostSignaling();
        submitHostAnswer = submitAnswer;

        offerCode
            .then((code) => {
                log(`offer code generated (${code.length} chars)`);
                db.transactions.setOfferCode({ code });
            })
            .catch((err: unknown) => reportError("Error generating offer", err));

        connected
            .then(({ transport, pc: newPc, signalChannel }) => {
                log(`host data channels open`);
                wirePeerConnection(newPc, signalChannel, "host");
                wireGameDb(config.assignUserId("host"), () => wireHostSync(transport));
            })
            .catch((err: unknown) => reportError("Connection failed", err));
    };

    const startJoin = () => {
        log(`startJoin`);
        db.transactions.startJoinSignaling();
    };

    const submitAnswer = () => {
        const code = db.resources.hostAnswerInput.trim();
        if (code && submitHostAnswer) {
            log(`submitting answer (${code.length} chars)`);
            submitHostAnswer(code);
        }
    };

    const generateAnswer = () => {
        const offerCodeFromHost = db.resources.joinerOfferInput.trim();
        if (joinStarted || !offerCodeFromHost) return;
        joinStarted = true;
        log(`generating answer for offer (${offerCodeFromHost.length} chars)`);
        db.transactions.setBanner({ text: "Generating answer — please wait…" });

        const { answerCode, connected } = startJoinerSignaling(offerCodeFromHost);

        answerCode
            .then((code) => {
                log(`answer code generated (${code.length} chars)`);
                db.transactions.setAnswerCode({ code });
            })
            .catch((err: unknown) => reportError("Error creating answer", err));

        connected
            .then(({ transport, pc: newPc, signalChannel }) => {
                log(`joiner data channels open`);
                wirePeerConnection(newPc, signalChannel, "joiner");
                wireGameDb(config.assignUserId("joiner"), () => wireJoinerSync(transport));
            })
            .catch((err: unknown) => reportError("Connection failed", err));
    };

    const reconnect = () => {
        const role = db.resources.role;
        if (!gameDb || !role) return;
        if (db.resources.connection === "reconnecting") return;
        log(`reconnect (role=${role})`);
        db.transactions.setConnection({ state: "reconnecting" });
        joinStarted = false;
        // Tear down the dead PC + renegotiator before building a new one.
        renegotiator?.dispose();
        renegotiator = undefined;
        pc?.close();
        pc = undefined;

        if (role === "host") {
            const { offerCode, submitAnswer: sa, connected } = startHostSignaling();
            submitHostAnswer = sa;
            offerCode
                .then((code) => db.transactions.setOfferCode({ code }))
                .catch((err: unknown) => reportError("Error generating offer", err));
            connected
                .then(({ transport, pc: newPc, signalChannel }) => {
                    log(`host data channels open (reconnect)`);
                    wirePeerConnection(newPc, signalChannel, "host");
                    wireHostSync(transport);
                })
                .catch((err: unknown) => reportError("Reconnection failed", err));
        } else {
            // For joiner, re-enter the signaling phase so the UI shows the textarea.
            db.transactions.startJoinSignaling();
            db.transactions.setConnection({ state: "reconnecting" });
        }
    };

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text).catch(() => undefined);
    };

    const dispose = () => {
        log(`dispose`);
        renegotiator?.dispose();
        renegotiator = undefined;
        pc?.close();
        pc = undefined;
        syncService?.dispose();
        syncServer?.dispose();
    };

    return { startHost, startJoin, submitAnswer, generateAnswer, copyText, reconnect, dispose };
};
