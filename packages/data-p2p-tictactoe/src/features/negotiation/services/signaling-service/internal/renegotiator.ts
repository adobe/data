// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// ICE-restart driver layered on top of an open RTCPeerConnection and a
// pre-established side-channel (RTCDataChannel) that carries renegotiation
// messages: offer, answer, and trickled ICE candidates. Used only inside the
// signaling-service implementation (see `../create.ts`).

export type Role = "host" | "joiner";

export interface Renegotiator {
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
