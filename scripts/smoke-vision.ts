import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.OPENCODE_VISION_AUTO_MODE = "auto"

const { VisionPlugin } = await import("../vision.ts")

const MODEL = process.env.OPENCODE_VISION_LOCAL_MODEL ?? "qwen3-vl:4b-instruct"
const OLLAMA_URL = (process.env.OPENCODE_VISION_LOCAL_URL ?? "http://localhost:11434/v1").replace(/\/+$/, "")

const FALLBACK_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const FIXTURE = process.env.SMOKE_IMAGE

const bytes = FIXTURE && existsSync(FIXTURE) ? readFileSync(FIXTURE) : Buffer.from(FALLBACK_PNG, "base64")
const base64 = bytes.toString("base64")
const mime = bytes[0] === 0x89 ? "image/png" : "image/jpeg"

const client = {
  provider: {
    list: async () => ({
      data: [
        {
          id: "ollama",
          models: {
            [MODEL]: {
              id: MODEL,
              name: MODEL,
              api: { url: OLLAMA_URL },
              capabilities: { input: { image: true } },
              cost: { input: 0, output: 0 },
            },
          },
        },
      ],
    }),
  },
}

const hooks = await VisionPlugin({ client } as never)

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

let failures = 0
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail.slice(0, 120)}`)
  if (!ok) failures++
}

console.log(`model=${MODEL} url=${OLLAMA_URL} image=${FIXTURE ?? "fallback 1x1"} (${bytes.length} bytes)\n`)

mkdirSync(join(tmpdir(), "opencode"), { recursive: true })
const filePath = join(tmpdir(), "opencode", "smoke.png")
writeFileSync(filePath, bytes)

const fileResult = (await hooks.tool.vision.execute(
  { path: filePath, prompt: "What is the main heading of this screen?" },
  ctx("ses_file") as never,
)) as string
check("file mode + custom prompt", fileResult.length > 0, fileResult)

const browserContent: Array<Record<string, unknown>> = [{ type: "image", data: base64, mimeType: mime }]
await hooks["tool.execute.after"](
  { tool: "browser_screenshot", sessionID: "ses_browser", callID: "c1", args: {} } as never,
  { content: browserContent } as never,
)
const browserText = browserContent
  .filter((c) => c.type === "text")
  .map((c) => String(c.text))
  .join("\n")
check("browser mcp inline", browserText.includes("Auto vision description"), browserText)

const pasteParts: Array<Record<string, unknown>> = [
  { type: "file", mime, url: `data:${mime};base64,${base64}`, sessionID: "ses_paste", messageID: "m1" },
]
await hooks["chat.message"](
  { sessionID: "ses_paste", messageID: "m1" } as never,
  { message: {}, parts: pasteParts } as never,
)
const pasteText = pasteParts
  .filter((p) => p.type === "text")
  .map((p) => String(p.text))
  .join("\n")
check("pasted image", pasteText.includes("Auto vision description"), pasteText)

const latest = (await hooks.tool.vision.execute({}, ctx("ses_browser") as never)) as string
check("vision() no-args after capture", latest.length > 0, latest)

await hooks["chat.params"](
  { sessionID: "ses_skip", model: { capabilities: { input: { image: true } } } } as never,
)
const skipParts: Array<Record<string, unknown>> = [
  { type: "file", mime, url: `data:${mime};base64,${base64}`, sessionID: "ses_skip", messageID: "m2" },
]
await hooks["chat.message"](
  { sessionID: "ses_skip", messageID: "m2" } as never,
  { message: {}, parts: skipParts } as never,
)
check("auto-skip (vision model)", skipParts.filter((p) => p.type === "text").length === 0, "no auto-description (correct)")

console.log(failures === 0 ? "\nALL FLOWS PASS (live Ollama)" : `\n${failures} FLOW(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
