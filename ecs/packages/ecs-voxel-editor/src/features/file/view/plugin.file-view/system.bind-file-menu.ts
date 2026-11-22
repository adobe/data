// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { library } from "../../../library/model/index.js";
import { fileMenu } from "./resource.file-menu.js";

/** Writes the file menu's items, each able to be chosen as the library allows: saving needs a folder ready to write to. */
export const bindFileMenu: System = System.create({
    readonly: true,
    resources: { is: [fileMenu], changed: [fileMenu, library] },
}, ({ resources }) => {
    const { state } = resources[library];
    const ready = state === "ready";
    resources[fileMenu].label = "File";
    resources[fileMenu].items = [
        { action: "new-document", label: "New document", enabled: true },
        { action: "new-model", label: "New model…", enabled: true },
        { action: "", label: "", enabled: false },
        { action: "choose-folder", label: "Choose library folder…", enabled: true },
        { action: "reconnect", label: "Reconnect library folder", enabled: state === "permission" },
        { action: "", label: "", enabled: false },
        { action: "save", label: "Save", enabled: ready },
        { action: "save-as", label: "Save as…", enabled: ready },
        { action: "save-standalone", label: "Save standalone…", enabled: ready, hint: "one file" },
    ];
});
