// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { createRpcEndpoint, createMessagePortTransport } from "@adobe/data-rpc";
import { MainService } from "../shared/main-service.js";
import { SubService } from "../shared/sub-service.js";
import { HANDSHAKE, type HandshakeMessage } from "../shared/handshake.js";
import { createMainService } from "./create-main-service.js";
import { MainPanel } from "./main-panel.js";

// Bootstrap the MAIN frame: embed the sub iframe, hand it one end of a
// MessageChannel, then expose the main service and consume the sub service over
// the other end. No top-level await (see repo CLAUDE.md) — all work is synchronous
// wiring plus event callbacks.
function init(): void {
    const app = document.getElementById("app");
    const frameContainer = document.getElementById("frame-container");
    if (app === null || frameContainer === null) return;

    const channel = new MessageChannel();

    const iframe = document.createElement("iframe");
    iframe.src = "/sub.html";
    iframe.title = "sub frame";
    iframe.style.cssText = "width: 100%; min-height: 360px; border: 0;";
    iframe.addEventListener(
        "load",
        () => {
            // Hand port2 to the sub. targetOrigin is this page's origin (same-origin sample).
            iframe.contentWindow?.postMessage({ type: HANDSHAKE } satisfies HandshakeMessage, location.origin, [channel.port2]);
        },
        { once: true },
    );
    frameContainer.appendChild(iframe);

    const endpoint = createRpcEndpoint(createMessagePortTransport(channel.port1));
    const mainService = createMainService();
    endpoint.expose("main", mainService, MainService.schema);
    const subService = endpoint.consume("sub", SubService.schema);

    render(MainPanel({ local: mainService, remote: subService }), app);
}

init();
