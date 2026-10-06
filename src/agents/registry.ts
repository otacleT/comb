import type { AgentAdapter } from './adapter.js';
import { claudeCode } from './claude-code.js';

export const AGENTS: Record<string, AgentAdapter> = { [claudeCode.id]: claudeCode };
