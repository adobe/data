// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Entry point. Manages the three screens:
//   1. Role selection  — "Host" or "Join"
//   2. Signaling       — copy-paste offer/answer exchange
//   3. Game            — live board synced over WebRTC

import { Database } from "@adobe/data/ecs";
import { createSyncServer, createSyncClient, createLoopbackTransport } from "@adobe/data-sync";
import { tictactoePlugin, type PlayerMark } from "./game-state.js";
import { startHostSignaling, startJoinerSignaling } from "./signaling.js";
import { mountGameView } from "./game-view.js";
import { setScreen, el, codeBox, pasteBox, banner } from "./ui.js";

// ---------------------------------------------------------------------------
// Screen 1: Role selection
// ---------------------------------------------------------------------------

const showRoleSelection = (): void => {
    const screen = el("div", { class: "role-select" },
        el("h2", {}, "Serverless P2P Tic-Tac-Toe"),
        el("p", { class: "subtitle" },
            "No server needed — connect directly with a friend using a pair of copy-pastes."
        ),
        el("div", { class: "role-buttons" },
            (() => {
                const btn = el("button", { class: "btn btn--role" }, "Host a game");
                btn.addEventListener("click", () => showHostSignaling());
                return btn;
            })(),
            (() => {
                const btn = el("button", { class: "btn btn--role btn--secondary" }, "Join a game");
                btn.addEventListener("click", () => showJoinSignaling());
                return btn;
            })(),
        ),
        el("p", { class: "hint" },
            "Host = plays as X · Joiner = plays as O"
        ),
    );
    setScreen(screen);
};

// ---------------------------------------------------------------------------
// Screen 2a: Host — generate offer, wait for answer
// ---------------------------------------------------------------------------

const showHostSignaling = (): void => {
    const screen = el("div", { class: "signaling" },
        el("h2", {}, "Host a game"),
    );

    const statusEl = banner("Generating invite code — please wait…");
    screen.appendChild(statusEl);
    setScreen(screen);

    const { offerCode, submitAnswer, connected } = startHostSignaling();

    offerCode.then((code) => {
        screen.removeChild(statusEl);

        screen.appendChild(el("p", { class: "step" },
            "Step 1 — Send this invite code to your friend:"
        ));
        screen.appendChild(codeBox(code, "Your invite code"));

        screen.appendChild(el("p", { class: "step" },
            "Step 2 — Paste the code your friend sends back:"
        ));
        screen.appendChild(pasteBox("Friend's answer code", "Connect →", (answer) => {
            submitAnswer(answer);
        }));

        screen.appendChild(el("p", { class: "step hint" },
            "Waiting for connection…"
        ));
    }).catch((err: unknown) => {
        screen.appendChild(banner(`Error generating offer: ${String(err)}`, "error"));
    });

    connected.then((serverTransport) => {
        // Host runs the SyncServer for the remote peer, plus a local loopback
        // for its own SyncClient (so it gets committed envelopes too).
        const syncServer = createSyncServer();

        // Connect the remote joiner via the WebRTC transport.
        syncServer.connect(serverTransport);

        // Connect the host's own SyncClient via an in-process loopback.
        const { client: loopbackClient, server: loopbackServer } = createLoopbackTransport();
        syncServer.connect(loopbackServer);

        // Create the database and wire the host's SyncClient to the loopback.
        const db = Database.create(tictactoePlugin);
        const syncClient = createSyncClient({ database: db as any, transport: loopbackClient });

        const myMark: PlayerMark = "X";
        mountGameView(db, syncClient, myMark);
    }).catch((err: unknown) => {
        screen.appendChild(banner(`Connection failed: ${String(err)}`, "error"));
    });
};

// ---------------------------------------------------------------------------
// Screen 2b: Joiner — paste offer, get answer, connect
// ---------------------------------------------------------------------------

const showJoinSignaling = (): void => {
    const screen = el("div", { class: "signaling" },
        el("h2", {}, "Join a game"),
        el("p", { class: "step" }, "Paste the invite code your friend gave you:"),
    );

    let signalingStarted = false;

    screen.appendChild(pasteBox("Host's invite code", "Generate answer →", (offerCode) => {
        if (signalingStarted) return;
        signalingStarted = true;

        screen.appendChild(banner("Generating answer — please wait…"));

        const { answerCode, connected } = startJoinerSignaling(offerCode);

        answerCode.then((code) => {
            screen.appendChild(el("p", { class: "step" },
                "Send this answer code back to your friend:"
            ));
            screen.appendChild(codeBox(code, "Your answer code"));
            screen.appendChild(el("p", { class: "hint" },
                "Once your friend enters it, the game starts automatically."
            ));
        }).catch((err: unknown) => {
            screen.appendChild(banner(`Error creating answer: ${String(err)}`, "error"));
        });

        connected.then((clientTransport) => {
            const db = Database.create(tictactoePlugin);
            const syncClient = createSyncClient({ database: db as any, transport: clientTransport });

            const myMark: PlayerMark = "O";
            mountGameView(db, syncClient, myMark);
        }).catch((err: unknown) => {
            screen.appendChild(banner(`Connection failed: ${String(err)}`, "error"));
        });
    }));

    setScreen(screen);
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

showRoleSelection();
