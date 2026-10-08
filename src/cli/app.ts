import { Command, CommanderError } from 'commander';
import { VERSION } from '../version.js';
import { registerArchive } from './commands/archive.js';
import { registerDocs } from './commands/docs.js';
import { registerInit } from './commands/init.js';
import { registerInstructions } from './commands/instructions.js';
import { registerList } from './commands/list.js';
import { registerMarkReviewed } from './commands/mark-reviewed.js';
import { registerNewChange } from './commands/new-change.js';
import { registerShow } from './commands/show.js';
import { registerStatus } from './commands/status.js';
import { registerUpdate } from './commands/update.js';
import { registerValidate } from './commands/validate.js';
import { diag } from '../core/diagnostics.js';
import { envelope, EXIT, render } from './output.js';

export interface CliContext {
  cwd: string;
  today: () => string;
  out: (text: string) => void;
  setCode: (code: number) => void;
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Today's date in the local time zone (YYYY-MM-DD), the date people expect in folder names and records. */
export const localDate = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type Registrar = (program: Command, ctx: CliContext) => void;

const registrars: Registrar[] = [registerInit, registerNewChange, registerValidate, registerStatus, registerInstructions, registerMarkReviewed, registerArchive, registerList, registerShow, registerUpdate, registerDocs];

export async function runCli(argv: string[], cwd: string, opts: { today?: () => string } = {}): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  let code: number = EXIT.OK;
  const ctx: CliContext = {
    cwd,
    today: opts.today ?? (() => localDate()),
    out: (text) => {
      stdout += text.endsWith('\n') ? text : `${text}\n`;
    },
    setCode: (c) => {
      code = c;
    },
  };
  const program = new Command();
  program
    .name('comb')
    .description('From tangled ideas to decided specs.')
    .version(VERSION)
    .exitOverride()
    .configureOutput({
      writeOut: (s) => {
        stdout += s;
      },
      writeErr: (s) => {
        stderr += s;
      },
    });
  for (const register of registrars) register(program, ctx);
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (e) {
    if (e instanceof CommanderError) {
      code = e.exitCode === 0 ? EXIT.OK : EXIT.USAGE;
      // Agents parse stdout as JSON; keep that contract for argument errors too.
      if (code === EXIT.USAGE && argv.includes('--json')) {
        const message = e.message.replace(/^error:\s*/, '');
        stdout += `${render(envelope(argv[0] ?? '', null, [diag('error', 'USAGE_ERROR', message)]), true, () => '')}\n`;
      }
    } else {
      stderr += `${(e as Error).stack ?? String(e)}\n`;
      code = EXIT.INTERNAL;
    }
  }
  return { code, stdout, stderr };
}
