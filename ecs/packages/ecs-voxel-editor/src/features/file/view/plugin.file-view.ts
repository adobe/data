// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin, World } from "@adobe/ecs";
import { FormDialog, MenuButton } from "../../../elements/index.js";
import { type LibraryAccess, libraryAccess } from "../../library/model/index.js";
import { addModel } from "../../palette/model/index.js";
import { define, on, root } from "../../../view/index.js";
import { bindFileMenu } from "./plugin.file-view/system.bind-file-menu.js";
import { collectThumbnails } from "./plugin.file-view/system.collect-thumbnails.js";
import { documentPath } from "./plugin.file-view/system.document-path.js";
import { findFileMenu } from "./plugin.file-view/system.find-file-menu.js";

/**
 * The file menu within the app's root, `menu-button.file`, and what its items do: a new document; a new model, asked for
 * by name and size in the page's `form-dialog`; choosing or reconnecting the library folder; and saving, asking for a
 * path where the document has none, and for Save as and Save standalone.
 */
export const fileView: Plugin<typeof root | typeof libraryAccess> = {
    systems: [findFileMenu, bindFileMenu],
    connect: (world, { [root]: page, [libraryAccess]: access }) => {
        define({ "menu-button": MenuButton, "form-dialog": FormDialog });
        const menu = page.querySelector<MenuButton>("menu-button.file");
        const dialog = page.querySelector("form-dialog");
        if (menu === null || dialog === null) return () => {};
        return on(menu, "menu-choose", event => void choose(event.detail.action, world, access, dialog));
    },
};

/** Does what a file menu item asks. */
async function choose(action: string, world: World, access: LibraryAccess, dialog: FormDialog): Promise<void> {
    if (action === "new-document") return access.create();
    if (action === "choose-folder") return access.choose();
    if (action === "reconnect") return access.reconnect();
    if (action === "new-model") {
        await dialog.ask({
            title: "New model",
            fields: [{ name: "name", label: "Name", kind: "text", value: "" }, { name: "size", label: "Size", kind: "number", value: "8", min: 1, max: 64 }],
            submit: "Add model",
            // Adding it is the check: its reason for not adding one keeps the dialog open.
            check: values => world.run(addModel, { name: values["name"] ?? "", size: Number(values["size"] ?? 8) }),
        });
        return;
    }
    if (action !== "save" && action !== "save-as" && action !== "save-standalone") return;
    const current = await world.run(documentPath);
    const standalone = action === "save-standalone";
    const path = action === "save" && current !== null ? current : await askPath(dialog, standalone
        ? { title: "Save standalone", submit: "Save", value: (current ?? "untitled.voxel.json").replace(suffix, `-standalone${suffix}`) }
        : { title: "Save as", submit: "Save", value: current ?? "untitled.voxel.json" });
    if (path === null) return;
    await access.save({ path, standalone, thumbnails: await world.run(collectThumbnails) });
}

const suffix = ".voxel.json";

/** A path in the library asked for in the dialog, with the file suffix added; null where it's cancelled. */
async function askPath(dialog: FormDialog, request: { readonly title: string; readonly submit: string; readonly value: string }): Promise<string | null> {
    const values = await dialog.ask({
        title: request.title,
        fields: [{ name: "path", label: "Path", kind: "text", value: request.value }],
        submit: request.submit,
        check: given => (given["path"] ?? "").trim() === "" ? "A file needs a path." : null,
    });
    const path = values?.["path"]?.trim() ?? "";
    if (path === "") return null;
    return path.endsWith(suffix) ? path : `${path}${suffix}`;
}
