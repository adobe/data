// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// ICE-restart driver layered on top of an open RTCPeerConnection and a
// pre-established side-channel (RTCDataChannel) that carries renegotiation
// messages: offer, answer, and trickled ICE candidates.
//
// Why ICE restart matters: the SCTP/DTLS state of an established connection
// is bound to specific ICE credentials and a specific NAT mapping. When the
// path breaks (Wi-Fi → ethernet, NAT remap, brief outage), ICE restart
// generates fresh candidates and credentials *while reusing the existing
// DTLS keys*, so the data channels survive the path change without a new
// copy-paste handshake.
//
// Why an existing data channel: WebRTC has no built-in signaling channel.
// Once the initial offer/answer is exchanged, peers need *some* transport
// to ferry the renegotiation. We use a second pre-negotiated data channel
// dedicated to that purpose so we don't multiplex our own envelopes onto
// the application's sync stream.
//
// Limitation: this only works while the signal channel is still alive. If
// the channel has already closed, the controller falls back to the manual
// reconnect flow.

export type Role = "host" | "joiner";

export interface Renegotiator {
    /**
     * Host-only: kicks off an ICE restart by creating a new offer with
     * `iceRestart: true`, setting it as the local description, and sending
     * it to the joiner over the signal channel. The joiner responds with an
     * answer, candidates trickle, and the connection re-converges to
     * `connected`. No-op on the joiner side.
     */
    readonly triggerIceRestart: () => Promise<void>;
    readonly dispose: () => void;
}

type SignalMessage =
    | { readonly kind: "offer"; readonly sdp: RTCSessionDescriptionInit }
    | { readonly kind: "answer"; readonly sdp: RTCSessionDescriptionInit }
    | { readonly kind: "ice"; readonly candidate: RTCIceCandidateInit };

const encode = (msg: SignalMessage): string => JSON.stringify(msg);
const decode = (raw: string): SignalMessage => JSON.parse(raw) as SignalMessage;

export const createRenegotiator = (
    pc: RTCPeerConnection,
    signalChannel: RTCDataChannel,
    role: Role,
    logger?: (msg: string) => void,
): Renegotiator => {
    const log = logger ?? (() => undefined);
    let disposed = false;

    const safeSend = (msg: SignalMessage): boolean => {
        if (disposed) return false;
        if (signalChannel.readyState !== "open") {
            log(`signal channel not open (state=${signalChannel.readyState}); dropping ${msg.kind}`);
            return false;
        }
        signalChannel.send(encode(msg));
        return true;
    };

    // Trickle every locally-gathered ICE candidate to the peer so it can
    // attach the new path as soon as it materialises.
    const onIceCandidate = (e: RTCPeerConnectionIceEvent) => {
        if (e.candidate === null) return;
        safeSend({ kind: "ice", candidate: e.candidate.toJSON() });
    };
    pc.addEventListener("icecandidate", onIceCandidate);

    const onSignalMessage = async (e: MessageEvent<string>) => {
        if (disposed) return;
        let msg: SignalMessage;
        try {
            msg = decode(e.data);
        } catch (err) {
            log(`failed to decode signal message: ${String(err)}`);
            return;
        }

        try {
            if (msg.kind === "offer") {
                log(`offer in (renegotiating)`);
                await pc.setRemoteDescription(msg.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                if (pc.localDescription !== null) {
                    safeSend({ kind: "answer", sdp: pc.localDescription });
                }
            } else if (msg.kind === "answer") {
                log(`answer in`);
                await pc.setRemoteDescription(msg.sdp);
            } else if (msg.kind === "ice") {
                await pc.addIceCandidate(msg.candidate);
            }
        } catch (err) {
            log(`error processing ${msg.kind}: ${String(err)}`);
        }
    };
    signalChannel.addEventListener("message", onSignalMessage);

    const triggerIceRestart = async (): Promise<void> => {
        if (disposed) return;
        if (role !== "host") {
            log(`triggerIceRestart called on joiner — ignored (host initiates)`);
            return;
        }
        if (signalChannel.readyState !== "open") {
            log(`signal channel not open; cannot trigger ICE restart`);
            return;
        }
        log(`triggering ICE restart`);
        try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            if (pc.localDescription !== null) {
                safeSend({ kind: "offer", sdp: pc.localDescription });
            }
        } catch (err) {
            log(`ICE restart failed: ${String(err)}`);
        }
    };

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        pc.removeEventListener("icecandidate", onIceCandidate);
        signalChannel.removeEventListener("message", onSignalMessage);
    };

    return { triggerIceRestart, dispose };
};
