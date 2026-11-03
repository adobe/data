// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Config } from './config.js';
import { createContext } from './implementation/check/context.js';
import { checkExports } from './implementation/check/exports.js';
import { checkImports } from './implementation/check/imports.js';
import { checkComponents, checkFolders, checkRoot } from './implementation/check/layout.js';
import { checkApps, checkSystems } from './implementation/check/systems.js';
import { analyze, settingsOf } from './implementation/graph.js';
import type { Violation } from './violation.js';

/**
 * The violations of the standard in an application's source: `files` is every `.ts` and `.md` file of its source
 * folder, by its path in that folder, posix, to its text.
 */
export const check = (files: Readonly<Record<string, string>>, config?: Config): readonly Violation[] => {
    const settings = settingsOf(config);
    const { context, violations } = createContext(analyze(files, settings), settings);
    checkRoot(context);
    checkFolders(context);
    checkComponents(context);
    const imports = checkImports(context);
    checkSystems(context);
    checkApps(context, imports);
    checkExports(context, imports);
    return violations;
};
