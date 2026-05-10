// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Serverless WebRTC signaling via copy-paste.
//
// The full ICE candidate list is embedded in the SDP by waiting for
// iceGatheringState === "complete" before exposing the blob. This means
// one copy-paste in each direction is sufficient — no real-time channel needed.

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

// ---------------------------------------------------------------------------
// Host signaling
// ---------------------------------------------------------------------------

/**
 * Initiates the host side of the WebRTC handshake.
 *
 * Returns:
 * - `offerCode` — base64 string to send to the joiner (display in a textarea)
 * - `submitAnswer(code)` — call when the joiner pastes their answer code
 * - `connected` — resolves to a ServerTransport once the channel opens
 *
 * The host wraps this ServerTransport into createSyncServer().connect(...).
 */
export const startHostSignaling = (): {
    offerCode: Promise<string>;
    submitAnswer: (answerCode: string) => void;
    connected: Promise<ServerTransport>;
} => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const channel = pc.createDataChannel("sync", { ordered: true });

    let submitAnswer!: (code: string) => void;
    const answerPromise = new Promise<string>((resolve) => { submitAnswer = resolve; });

    const offerCode = (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceComplete(pc);
        return encodeSession(pc.localDescription!);
    })();

    const connected = (async (): Promise<ServerTransport> => {
        const code = await answerPromise;
        await pc.setRemoteDescription(decodeSession(code));

        await new Promise<void>((resolve, reject) => {
            if (channel.readyState === "open") { resolve(); return; }
            channel.addEventListener("open", () => resolve());
            channel.addEventListener("error", (e) => reject(new Error(String(e))));
            pc.addEventListener("connectionstatechange", () => {
                if (pc.connectionState === "failed") reject(new Error("WebRTC connection failed"));
            });
        });

        return createWebRTCServerTransport(channel);
    })();

    return { offerCode, submitAnswer, connected };
};

// ---------------------------------------------------------------------------
// Joiner signaling
// ---------------------------------------------------------------------------

/**
 * Initiates the joiner side of the WebRTC handshake.
 *
 * Returns:
 * - `answerCode` — base64 string to send back to the host
 * - `connected` — resolves to a ClientTransport once the channel opens
 */
export const startJoinerSignaling = (offerCode: string): {
    answerCode: Promise<string>;
    connected: Promise<ClientTransport>;
} => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    const channelPromise = new Promise<RTCDataChannel>((resolve) => {
        pc.ondatachannel = (e) => resolve(e.channel);
    });

    const answerCode = (async () => {
        await pc.setRemoteDescription(decodeSession(offerCode));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceComplete(pc);
        return encodeSession(pc.localDescription!);
    })();

    const connected = (async (): Promise<ClientTransport> => {
        const channel = await channelPromise;

        await new Promise<void>((resolve, reject) => {
            if (channel.readyState === "open") { resolve(); return; }
            channel.addEventListener("open", () => resolve());
            channel.addEventListener("error", (e) => reject(new Error(String(e))));
            pc.addEventListener("connectionstatechange", () => {
                if (pc.connectionState === "failed") reject(new Error("WebRTC connection failed"));
            });
        });

        return createWebRTCClientTransport(channel);
    })();

    return { answerCode, connected };
};
