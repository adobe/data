// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Database-bound orchestrator for the peer-to-peer connection lifecycle. It
// drives the outside-world `signaling-service` capability (copy-paste WebRTC
// handshake) for the serializable code exchange, then wires @adobe/data-sync and
// constructs the synced game database when a peer link comes up. All results flow
// back to the UI purely through negotiation transactions — the UI calls
// `service.actions.*` and renders from observable state, never touching this
// surface directly.
//
// The service retains its own closure-scoped procedural state (sync handles, the
// game database, the current peer link) because it is non-serializable and tied
// to per-instance browser objects — exactly what a service is for.

import { Database, createRebaseReplayConcurrency } from "@adobe/data/ecs";
import { createSyncServer, createSyncService, createLoopbackTransport, type SyncService, type ServerTransport, type ClientTransport } from "@adobe/data-sync";
import { SignalingService } from "../../../signaling-service/signaling-service.js";
import type { Role } from "../../../../data/role/role.js";
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

type GameDb = Database<any, any, any, any, any, any, any, any>;

/**
 * Per-instance configuration handed to the service via `configure()` after
 * mount. The game plugin / userId mapping live here because they are necessarily
 * game-specific and cannot be encoded into the negotiation plugin itself.
 */
export interface NegotiationConfig {
  readonly gamePlugin: Database.Plugin<any, any, any, any, any, any, any, any>;
  readonly assignUserId: (role: Role) => string;
}

export interface ConnectionService {
  configure(config: NegotiationConfig): void;
  startHost(): void;
  startJoin(): void;
  submitAnswer(): void;
  generateAnswer(): void;
  reconnect(): void;
  dispose(): void;
}

const log = (msg: string) => console.log(`[connection] ${msg}`);
const syncLog = (msg: string) => console.log(`[sync] ${msg}`);
const serverLog = (msg: string) => console.log(`[sync-server] ${msg}`);

/**
 * Create the connection service bound to its database. `signalingFactory`
 * defaults to the production {@link SignalingService.create}; tests inject
 * {@link SignalingService.createFake} for deterministic code exchange.
 */
export const createConnectionService = (
  db: TransactionDatabase,
  signalingFactory: (handlers: SignalingService.Handlers) => SignalingService = SignalingService.create,
): ConnectionService => {
  let config: NegotiationConfig | undefined;
  const requireConfig = (): NegotiationConfig => {
    if (!config) throw new Error("connection service used before configure()");
    return config;
  };

  let joinStarted = false;
  let syncService: SyncService | undefined;
  let syncServer: ReturnType<typeof createSyncServer> | undefined;
  let gameDb: GameDb | undefined;

  const reportError = (text: string, err: unknown) =>
    db.transactions.setBanner({ text: `${text}: ${String(err)}`, error: true });

  const onTransportClose = () => {
    log(`transport close observed; current connection=${db.resources.connection}`);
    if (db.resources.connection === "connected" || db.resources.connection === "reconnecting") {
      db.transactions.setConnection({ connection: "disconnected" });
    }
  };

  const wireHostSync = (serverTransport: ServerTransport) => {
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
    db.transactions.setConnection({ connection: "connected", sessionId: syncServer.sessionId });
  };

  const wireJoinerSync = (clientTransport: ClientTransport) => {
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
        db.transactions.setConnection({ connection: "connected", sessionId });
      },
    });

    clientTransport.onClose(onTransportClose);
  };

  const wireGameDb = (userId: string, wireSync: () => void) => {
    if (!gameDb) {
      log(`creating game DB for userId=${userId}`);
      gameDb = Database.create(requireConfig().gamePlugin, { concurrency: createRebaseReplayConcurrency(userId) });
    }
    wireSync();
    db.transactions.setGameDb({ gameDb });
  };

  // A completed handshake: build the game DB (once) and wire sync for the role.
  // The peer link auto-triggers ICE restart internally when the path degrades.
  const signaling = signalingFactory({
    onConnected: (connection) => {
      log(`${connection.role} peer link established`);
      if (connection.role === "host") {
        wireGameDb(requireConfig().assignUserId("host"), () => wireHostSync(connection.transport));
      } else {
        wireGameDb(requireConfig().assignUserId("joiner"), () => wireJoinerSync(connection.transport));
      }
    },
  });

  const startHost = () => {
    log(`startHost`);
    db.transactions.startHostSignaling();
    signaling
      .createHostInvite()
      .then((code) => {
        log(`offer code generated (${code.length} chars)`);
        db.transactions.setOfferCode({ code });
      })
      .catch((err: unknown) => reportError("Error generating offer", err));
  };

  const startJoin = () => {
    log(`startJoin`);
    db.transactions.startJoinSignaling();
  };

  const submitAnswer = () => {
    const code = db.resources.hostAnswerInput.trim();
    if (!code) return;
    log(`submitting answer (${code.length} chars)`);
    signaling.acceptHostAnswer(code).catch((err: unknown) => reportError("Connection failed", err));
  };

  const generateAnswer = () => {
    const offerCodeFromHost = db.resources.joinerOfferInput.trim();
    if (joinStarted || !offerCodeFromHost) return;
    joinStarted = true;
    log(`generating answer for offer (${offerCodeFromHost.length} chars)`);
    db.transactions.setBanner({ text: "Generating answer — please wait…" });

    signaling
      .createJoinAnswer(offerCodeFromHost)
      .then((code) => {
        log(`answer code generated (${code.length} chars)`);
        db.transactions.setAnswerCode({ code });
      })
      .catch((err: unknown) => reportError("Error creating answer", err));
  };

  const reconnect = () => {
    const role = db.resources.role;
    if (!gameDb || !role) return;
    if (db.resources.connection === "reconnecting") return;
    log(`reconnect (role=${role})`);
    db.transactions.setConnection({ connection: "reconnecting" });
    joinStarted = false;
    // Tear down the dead peer link before building a new one.
    signaling.reset();

    if (role === "host") {
      signaling
        .createHostInvite()
        .then((code) => db.transactions.setOfferCode({ code }))
        .catch((err: unknown) => reportError("Error generating offer", err));
    } else {
      // For joiner, re-enter the signaling phase so the UI shows the textarea.
      db.transactions.startJoinSignaling();
      db.transactions.setConnection({ connection: "reconnecting" });
    }
  };

  const dispose = () => {
    log(`dispose`);
    signaling.dispose();
    syncService?.dispose();
    syncServer?.dispose();
  };

  const configure = (c: NegotiationConfig) => { config = c; };

  return { configure, startHost, startJoin, submitAnswer, generateAnswer, reconnect, dispose };
};
