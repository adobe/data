// © 2026 Adobe. MIT License. See /LICENSE for details.
import { check, defaults, type Config } from "../index.js";

// A scene feature with two layers of its own naming, a shader kind, and its apps in demos/.
const files: Record<string, string> = {
    "scene/core/README.md": "# core\n\nWhat the scene holds.\n",
    "scene/core/index.ts": "export * from './shader.fill.js';\n",
    "scene/core/shader.fill.ts": "/** Fills each pixel. */\nexport const fill = 'fn main() {}';\n",
    "scene/ui/README.md": "# ui\n\nThe scene's controls.\n",
    "scene/ui/index.ts": "export * from './function.show-scene.js';\n",
    "scene/ui/function.show-scene.ts": "import { fill } from '../core/index.js';\n\n/** Shows the scene. */\nexport const showScene = (): string => fill;\n",
    "demos/main.ts": "import { showScene } from '../scene/ui/index.js';\nexport const shown = showScene();\n",
};

const config: Config = {
    layers: { core: ["core"], ui: ["core", "ui"] },
    kinds: [...defaults.kinds, "shader"],
    apps: ["demos"],
    systems: [],
};

const rules = (source: Readonly<Record<string, string>>, given?: Config): string =>
    [...new Set(check(source, given).map(violation => violation.rule))].sort().join(", ") || "none";

export const main = async (): Promise<void> => {
    console.log("the standard's layers:", rules(files));
    console.log("its own:", rules(files, config));
    const upward = { ...files, "scene/core/shader.fill.ts": "import { showScene } from '../ui/index.js';\n\n/** Fills each pixel. */\nexport const fill = `${showScene}`;\n" };
    console.log("core importing ui:", rules(upward, config));
};
