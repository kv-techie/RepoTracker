/**
 * Server-only helper for talking to the local agent.
 * Attaches the agent API token so the browser never sees it.
 * Token source: AGENT_TOKEN env var, else RT_AGENT_TOKEN from agent/.env
 * (written by the agent on first start).
 */

import { readFileSync } from 'fs';
import path from 'path';

export const AGENT_BASE = process.env.AGENT_BASE_URL ?? 'http://127.0.0.1:8001';
const DEFAULT_TIMEOUT_MS = 8_000;

const TOKEN_TTL_MS = 30_000;
let cachedToken = { value: '', readAt: 0 };

function readAgentToken(force = false): string {
  if (process.env.AGENT_TOKEN) return process.env.AGENT_TOKEN;
  if (!force && cachedToken.value && Date.now() - cachedToken.readAt < TOKEN_TTL_MS) {
    return cachedToken.value;
  }
  try {
    const env = readFileSync(path.join(process.cwd(), 'agent', '.env'), 'utf8');
    const match = env.match(/^RT_AGENT_TOKEN=(.+)$/m);
    cachedToken = { value: match ? match[1].trim() : '', readAt: Date.now() };
  } catch {
    cachedToken = { value: '', readAt: Date.now() };
  }
  return cachedToken.value;
}

export async function agentFetch(
  pathname: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const send = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set('X-Agent-Token', token);
    // Fail fast if the agent is stuck, so pages show "agent offline" instead of hanging
    const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
    return fetch(`${AGENT_BASE}${pathname}`, { cache: 'no-store', ...init, headers, signal });
  };

  const response = await send(readAgentToken());
  // A restarted agent writes a new token: re-read the file once and retry before giving up
  if (response.status === 401) return send(readAgentToken(true));
  return response;
}
