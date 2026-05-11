// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Serverless WebRTC signaling via copy-paste.
//
// The full ICE candidate list is embedded in the SDP by waiting for
// iceGatheringState === "complete" before exposing the blob — one
// copy-paste in each direction is sufficient for the initial handshake.
//
// Both peers pre-create two `negotiated: true` data channels with matching
// stream ids:
//   - id 0 ("sync")   — carries @adobe/data-sync messages
//   - id 1 ("signal") — carries WebRTC renegotiation messages used by the
//                       renegotiator (ICE restart offer/answer/candidates).
//
// Pre-negotiated channels mean both sides have the channel objects in hand
// before SDP is exchanged, so no `ondatachannel` event race and no SDP
// renegotiation is needed to bring the second channel up.

import {
    waitForIceComplete,
    encodeSession,
    decodeSession,
    createWebRTCServerTransport,
    createWebRTCClientTransport,
} from "./webrtc-transport.js";
import type { ServerTransport, ClientTransport } from "@adobe/data-sync";

const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

const SYNC_CHANNEL_ID = 0;
const SIGNAL_CHANNEL_ID = 1;

const createPair = (pc: RTCPeerConnection): { sync: RTCDataChannel; signal: RTCDataChannel } => ({
    sync: pc.createDataChannel("sync", { ordered: true, negotiated: true, id: SYNC_CHANNEL_ID }),
    signal: pc.createDataChannel("signal", { ordered: true, negotiated: true, id: SIGNAL_CHANNEL_ID }),
});

const waitForChannelOpen = (pc: RTCPeerConnection, channel: RTCDataChannel): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (channel.readyState === "open") { resolve(); return; }
        channel.addEventListener("open", () => resolve());
        channel.addEventListener("error", (e) => reject(new Error(String(e))));
        pc.addEventListener("connectionstatechange", () => {
            if (pc.connectionState === "failed") reject(new Error("WebRTC connection failed"));
        });
    });

// ---------------------------------------------------------------------------
// Host signaling
// ---------------------------------------------------------------------------

export interface HostConnection {
    readonly transport: ServerTransport;
    readonly pc: RTCPeerConnection;
    readonly signalChannel: RTCDataChannel;
}

/**
 * Initiates the host side of the WebRTC handshake.
 *
 * Returns:
 * - `offerCode` — base64 string to send to the joiner (display in a textarea)
 * - `submitAnswer(code)` — call when the joiner pastes their answer code
 * - `connected` — resolves to a {@link HostConnection} once both data channels open
 */
export const startHostSignaling = (): {
    offerCode: Promise<string>;
    submitAnswer: (answerCode: string) => void;
    connected: Promise<HostConnection>;
} => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const { sync: syncChannel, signal: signalChannel } = createPair(pc);

    let submitAnswer!: (code: string) => void;
    const answerPromise = new Promise<string>((resolve) => { submitAnswer = resolve; });

    const offerCode = (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceComplete(pc);
        return encodeSession(pc.localDescription!);
    })();

    const connected = (async (): Promise<HostConnection> => {
        const code = await answerPromise;
        await pc.setRemoteDescription(decodeSession(code));
        await waitForChannelOpen(pc, syncChannel);
        // The signal channel uses the same underlying SCTP association; once
        // the connection is up it opens almost immediately, but await it
        // explicitly so callers can use it without a readyState dance.
        await waitForChannelOpen(pc, signalChannel);
        return {
            transport: createWebRTCServerTransport(syncChannel),
            pc,
            signalChannel,
        };
    })();

    return { offerCode, submitAnswer, connected };
};

// ---------------------------------------------------------------------------
// Joiner signaling
// ---------------------------------------------------------------------------

export interface JoinerConnection {
    readonly transport: ClientTransport;
    readonly pc: RTCPeerConnection;
    readonly signalChannel: RTCDataChannel;
}

/**
 * Initiates the joiner side of the WebRTC handshake.
 *
 * Returns:
 * - `answerCode` — base64 string to send back to the host
 * - `connected` — resolves to a {@link JoinerConnection} once both data channels open
 */
export const startJoinerSignaling = (offerCode: string): {
    answerCode: Promise<string>;
    connected: Promise<JoinerConnection>;
} => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    // Pre-create the negotiated channels with matching ids BEFORE setting the
    // remote description, so they're ready to open as soon as the SCTP
    // association comes up.
    const { sync: syncChannel, signal: signalChannel } = createPair(pc);

    const answerCode = (async () => {
        await pc.setRemoteDescription(decodeSession(offerCode));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceComplete(pc);
        return encodeSession(pc.localDescription!);
    })();

    const connected = (async (): Promise<JoinerConnection> => {
        await waitForChannelOpen(pc, syncChannel);
        await waitForChannelOpen(pc, signalChannel);
        return {
            transport: createWebRTCClientTransport(syncChannel),
            pc,
            signalChannel,
        };
    })();

    return { answerCode, connected };
};
