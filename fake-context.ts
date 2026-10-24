import { VisionPlugin } from "./vision"

type Hook = (event: never) => Promise<void> | void

export interface Recorded {
  tools: Record<string, { description: string; input: unknown; execute: (args: unknown, ctx: unknown) => Promise<unknown> }>
  hooks: Record<string, Hook>
}

const registration = { dispose: async () => {} }

function idle(signal?: AbortSignal): AsyncIterable<never> {
  return (async function* () {
    await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }))
  })()
}

/** Minimal stand-in for the V2 plugin context: records registrations instead of serving them. */
export async function loadPlugin(
  client: { provider: unknown; model: unknown; integration?: unknown },
  location = { directory: "/tmp/opencode", canonical: "/tmp/opencode" },
): Promise<{ recorded: Recorded; cleanup?: () => Promise<void> | void }> {
  const recorded: Recorded = { tools: {}, hooks: {} }
  const ctx = {
    location: { directory: location.directory, project: { id: "p", directory: location.directory, canonical: location.canonical } },
    options: {},
    provider: client.provider,
    model: client.model,
    integration: client.integration,
    tool: {
      transform: async (callback: (editor: { add: (tool: never) => void }) => void) => {
        callback({ add: (tool) => void (recorded.tools[(tool as { name: string }).name] = tool) })
        return registration
      },
      hook: async (name: string, callback: Hook) => {
        recorded.hooks[`tool.${name}`] = callback
        return registration
      },
    },
    session: {
      hook: async (name: string, callback: Hook) => {
        recorded.hooks[`session.${name}`] = callback
        return registration
      },
    },
    event: { subscribe: (options?: { signal?: AbortSignal }) => idle(options?.signal) },
  }

  const cleanup = (await VisionPlugin.setup(ctx as never)) ?? undefined
  return { recorded, cleanup }
}

export function toolContext(sessionID: string) {
  return {
    sessionID,
    agent: "a",
    messageID: "m",
    id: "c1",
    progress: async () => {},
    signal: new AbortController().signal,
  }
}
