#!/usr/bin/env node
import { runCli } from './app.js';

const result = await runCli(process.argv.slice(2), process.cwd());
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.code;
