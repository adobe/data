// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { createRpcEndpoint, createMessagePortTransport } from "@adobe/data-rpc";
import { MainService } from "../shared/main-service.js";
import { SubService } from "../shared/sub-service.js";
import { HANDSHAKE, type HandshakeMessage } from "../shared/handshake.js";
import { createSubService } from "./create-sub-service.js";
import { SubPanel } from "./sub-panel.js";

// Bootstrap the SUB frame: wait for the main frame to hand over a MessagePort,
// then expose the sub service and consume the main service over it.
function init(): void {
    const app = document.getElementById("app");
    if (app === null) return;

    window.addEventListener(
        "message",
        (event: MessageEvent) => {
            if (event.origin !== location.origin) return; // same-origin trust boundary
            const data = event.data as Partial<HandshakeMessage> | null;
            if (data === null || data.type !== HANDSHAKE) return;
            const port = event.ports[0];
            if (port === undefined) return;

            const endpoint = createRpcEndpoint(createMessagePortTransport(port));
            const subService = createSubService();
            endpoint.expose("sub", subService, SubService.schema);
            const mainService = endpoint.consume("main", MainService.schema);

            render(SubPanel({ local: subService, remote: mainService }), app);
        },
        { once: true },
    );
}

init();
