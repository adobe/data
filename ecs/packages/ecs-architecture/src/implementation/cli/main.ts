// © 2026 Adobe. MIT License. See /LICENSE for details.
import { run } from './run.js';

const { output, code } = run(process.argv.slice(2), process.cwd());
process.stdout.write(output);
process.exitCode = code;
