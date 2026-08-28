import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { clearCache } from "./backend-discovery"

// Pin the auto mode and drop env pins before vision.ts loads its module-level
// constants, so this suite is deterministic regardless of the outer shell.
process.env.OPENCODE_VISION_AUTO_MODE = "auto"
delete process.env.OPENCODE_VISION_LOCAL_MODEL
delete process.env.OPENCODE_VISION_OLLAMA_MODEL

const { VisionPlugin } = await import("./vision")

const RED_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const MOCK_DESCRIPTION = "MOCK: solid red field"

const mockClient = {
  provider: {
    list: async () => ({
      data: [
        {
          id: "ollama",
          models: {
            "gemma4:e4b": {
              id: "gemma4:e4b",
              name: "gemma4:e4b",
              api: { url: "http://localhost:11434/v1" },
              capabilities: { input: { image: true } },
              cost: { input: 0, output: 0 },
            },
          },
        },
      ],
    }),
  },
}

function mockResponse() {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: MOCK_DESCRIPTION } }] }),
  }
}

const originalFetch = globalThis.fetch
let fetchCalls = 0
let lastBody = ""
let hooks: Awaited<ReturnType<typeof VisionPlugin>>

const ctx = (sessionID: string) => ({
  sessionID,
  messageID: "m",
  agent: "a",
  directory: "/tmp/opencode",
  worktree: "/tmp/opencode",
  abort: new AbortController().signal,
  metadata() {},
  ask() {},
})

beforeAll(async () => {
  hooks = await VisionPlugin({ client: mockClient } as never)
  mkdirSync(join(tmpdir(), "opencode"), { recursive: true })
})

beforeEach(() => {
  clearCache()
  fetchCalls = 0
  lastBody = ""
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    fetchCalls++
    lastBody = String(init?.body ?? "")
    return mockResponse()
  }) as unknown as typeof fetch
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

describe("capture flows", () => {
  it("describes a file on disk via vision(path=...)", async () => {
    const path = join(tmpdir(), "opencode", "integration.png")
    writeFileSync(path, Buffer.from(RED_PNG, "base64"))
    const result = (await hooks.tool.vision.execute({ path }, ctx("ses_file") as never)) as string
    expect(result).toContain(MOCK_DESCRIPTION)
  })

  it("passes a custom prompt through to the vision backend", async () => {
    const path = join(tmpdir(), "opencode", "integration.png")
    writeFileSync(path, Buffer.from(RED_PNG, "base64"))
    const prompt = "Is there a login button, and is it enabled?"
    const result = (await hooks.tool.vision.execute({ path, prompt }, ctx("ses_prompt") as never)) as string
    expect(result).toContain(MOCK_DESCRIPTION)
    expect(lastBody).toContain(`Specific question: ${prompt}`)
  })

  it("auto-describes a browser screenshot via tool.execute.after", async () => {
    const content: Array<Record<string, unknown>> = [{ type: "image", data: RED_PNG, mimeType: "image/png" }]
    await hooks["tool.execute.after"](
      { tool: "browser_screenshot", sessionID: "ses_browser", callID: "c1", args: {} } as never,
      { content } as never,
    )
    const text = content
      .filter((c) => c.type === "text")
      .map((c) => String(c.text))
      .join("\n")
    expect(text).toContain("Auto vision description")
    expect(text).toContain(MOCK_DESCRIPTION)
  })

  it("auto-describes a pasted image via chat.message", async () => {
    const parts: Array<Record<string, unknown>> = [
      { type: "file", mime: "image/png", url: `data:image/png;base64,${RED_PNG}`, sessionID: "ses_paste", messageID: "m1" },
    ]
    await hooks["chat.message"](
      { sessionID: "ses_paste", messageID: "m1" } as never,
      { message: {}, parts } as never,
    )
    const text = parts
      .filter((p) => p.type === "text")
      .map((p) => String(p.text))
      .join("\n")
    expect(text).toContain("Auto vision description")
    expect(text).toContain(MOCK_DESCRIPTION)
  })

  it("reads the latest browser screenshot with vision() and no args", async () => {
    const content: Array<Record<string, unknown>> = [{ type: "image", data: RED_PNG, mimeType: "image/png" }]
    await hooks["tool.execute.after"](
      { tool: "browser_screenshot", sessionID: "ses_latest", callID: "c2", args: {} } as never,
      { content } as never,
    )
    const result = (await hooks.tool.vision.execute({}, ctx("ses_latest") as never)) as string
    expect(result).toContain(MOCK_DESCRIPTION)
  })

  it("skips auto-description when the active model has vision", async () => {
    await hooks["chat.params"](
      { sessionID: "ses_skip", model: { capabilities: { input: { image: true } } } } as never,
    )
    const parts: Array<Record<string, unknown>> = [
      { type: "file", mime: "image/png", url: `data:image/png;base64,${RED_PNG}`, sessionID: "ses_skip", messageID: "m2" },
    ]
    await hooks["chat.message"](
      { sessionID: "ses_skip", messageID: "m2" } as never,
      { message: {}, parts } as never,
    )
    expect(parts.filter((p) => p.type === "text")).toHaveLength(0)
    expect(fetchCalls).toBe(0)
  })
})

describe("vision tool validation", () => {
  it("rejects no-args when no screenshot was captured", async () => {
    await expect(hooks.tool.vision.execute({}, ctx("ses_none") as never)).rejects.toThrow(/no screenshot found/)
  })

  it("rejects a nonexistent path", async () => {
    await expect(
      hooks.tool.vision.execute({ path: join(tmpdir(), "opencode", "nope.png") }, ctx("ses_missing") as never),
    ).rejects.toThrow(/image not found/)
  })

  it("rejects a path outside the allowed roots", async () => {
    const outside = join(tmpdir(), "evil.png")
    writeFileSync(outside, Buffer.from(RED_PNG, "base64"))
    await expect(
      hooks.tool.vision.execute({ path: outside }, ctx("ses_outside") as never),
    ).rejects.toThrow(/outside the project/)
  })

  it("rejects an empty file", async () => {
    const empty = join(tmpdir(), "opencode", "empty.png")
    writeFileSync(empty, "")
    await expect(hooks.tool.vision.execute({ path: empty }, ctx("ses_empty") as never)).rejects.toThrow(/image is empty/)
  })

  it("rejects an unsupported image format", async () => {
    const bad = join(tmpdir(), "opencode", "bad.png")
    writeFileSync(bad, Buffer.from("not an image at all"))
    await expect(
      hooks.tool.vision.execute({ path: bad }, ctx("ses_bad") as never),
    ).rejects.toThrow(/unsupported image format/)
  })
})
