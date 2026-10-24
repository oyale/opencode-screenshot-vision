import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadPlugin, toolContext } from "../fake-context"

process.env.OPENCODE_VISION_AUTO_MODE = "auto"

const MODEL = process.env.OPENCODE_VISION_LOCAL_MODEL ?? "qwen3-vl:4b-instruct"
const OLLAMA_URL = (process.env.OPENCODE_VISION_LOCAL_URL ?? "http://localhost:11434/v1").replace(/\/+$/, "")

const FALLBACK_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const FIXTURE = process.env.SMOKE_IMAGE

const bytes = FIXTURE && existsSync(FIXTURE) ? readFileSync(FIXTURE) : Buffer.from(FALLBACK_PNG, "base64")
const base64 = bytes.toString("base64")
const mime = bytes[0] === 0x89 ? "image/png" : "image/jpeg"
const dataUrl = `data:${mime};base64,${base64}`

const { recorded } = await loadPlugin({
  provider: { list: async () => ({ data: [{ id: "ollama", settings: { baseURL: OLLAMA_URL } }] }) },
  model: {
    list: async () => ({
      data: [
        {
          id: MODEL,
          modelID: MODEL,
          providerID: "ollama",
          name: MODEL,
          capabilities: { input: ["text", "image"] },
          cost: [{ input: 0, output: 0 }],
        },
      ],
    }),
  },
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

const fileResult = (await recorded.tools.vision.execute(
  { path: filePath, prompt: "What is the main heading of this screen?" },
  toolContext("ses_file"),
)) as { content: string }
check("file mode + custom prompt", fileResult.content.length > 0, fileResult.content)

const browserEvent = {
  tool: "browser_screenshot",
  sessionID: "ses_browser",
  agent: "a",
  messageID: "m",
  id: "c1",
  input: {},
  status: "completed" as const,
  result: { content: [{ type: "file", uri: dataUrl, mime }] },
}
await recorded.hooks["tool.execute.after"](browserEvent as never)
const browserText = JSON.stringify(browserEvent.result.content)
check("browser mcp inline", browserText.includes("Auto vision description"), browserText)

const pasteEvent = { sessionID: "ses_paste", messageID: "m1", delivery: "steer" as const, prompt: { text: "", files: [{ uri: dataUrl }] } }
await recorded.hooks["session.prompt"](pasteEvent as never)
check("pasted image", pasteEvent.prompt.text.includes("Auto vision description"), pasteEvent.prompt.text)

const latest = (await recorded.tools.vision.execute({}, toolContext("ses_browser"))) as { content: string }
check("vision() no-args after capture", latest.content.length > 0, latest.content)

await recorded.hooks["session.context"]({
  sessionID: "ses_skip",
  agent: "a",
  model: { providerID: "ollama", id: MODEL },
  system: [],
  messages: [],
  options: {},
  tools: {},
} as never)
const skipEvent = { sessionID: "ses_skip", messageID: "m2", delivery: "steer" as const, prompt: { text: "", files: [{ uri: dataUrl }] } }
await recorded.hooks["session.prompt"](skipEvent as never)
check("auto-skip (vision model)", skipEvent.prompt.text === "", "no auto-description (correct)")

console.log(failures === 0 ? "\nALL FLOWS PASS (live Ollama)" : `\n${failures} FLOW(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
