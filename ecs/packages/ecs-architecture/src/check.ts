// © 2026 Adobe. MIT License. See /LICENSE for details.
import { loadParser } from '#parser';
import type { Config } from './config.js';
import { createContext } from './implementation/check/context.js';
import { checkExports } from './implementation/check/exports.js';
import { checkImports } from './implementation/check/imports.js';
import { checkComponents, checkFiles, checkFolders, checkRoot, checkTests } from './implementation/check/layout.js';
import { checkApps, checkDerivations, checkSystems } from './implementation/check/systems.js';
import { analyze, settingsOf } from './implementation/graph.js';
import type { Violation } from './violation.js';

/**
 * The violations of the standard in an application's source: `files` is every `.ts` and `.md` file of its source
 * folder, by its path in that folder, posix, to its text.
 */
export const check = async (files: Readonly<Record<string, string>>, config?: Config): Promise<readonly Violation[]> => {
    const settings = settingsOf(config);
    const { context, violations } = createContext(analyze(files, settings, await loadParser()), settings);
    checkRoot(context);
    checkFolders(context);
    checkComponents(context);
    checkFiles(context);
    checkTests(context);
    const imports = checkImports(context);
    checkSystems(context);
    checkDerivations(context);
    checkApps(context, imports);
    checkExports(context, imports);
    return violations;
};
