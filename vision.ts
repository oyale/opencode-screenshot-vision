import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const DEFAULT_PROMPT =
  "You are describing a screenshot captured during an automated browser test performed by an LLM. " +
  "Your description will be used to verify the test outcome. Describe precisely what is visible: " +
  "page title and URL if shown, all visible text (verbatim), UI elements (buttons, links, forms, inputs), " +
  "layout and positioning, and any error messages, warnings, popups, or unexpected states. " +
  "Do not speculate about content that is not visible. Be concise and factual."

const TIMEOUT_MS = 30_000
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

function mimeOf(path: string): string {
  switch (path.split(".").pop()?.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    default:
      return "image/png"
  }
}

function zenKey(): string {
  try {
    const auth = JSON.parse(
      readFileSync(join(homedir(), ".local/share/opencode/auth.json"), "utf8"),
    )
    return auth.opencode?.key ?? ""
  } catch {
    return ""
  }
}

async function postJson(url: string, body: unknown, auth?: string): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": UA,
    }
    if (auth) headers.Authorization = `Bearer ${auth}`
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function ollama(image: string, prompt: string): Promise<string> {
  const data = await postJson("http://localhost:11434/api/generate", {
    model: "gemma4:e4b",
    prompt,
    images: [image],
    stream: false,
    options: { temperature: 0.2 },
  })
  return data.response
}

async function zenChat(model: string, image: string, mime: string, prompt: string): Promise<string> {
  const key = zenKey()
  if (!key) throw new Error("no opencode zen api key")
  const data = await postJson(
    "https://opencode.ai/zen/v1/chat/completions",
    {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${image}` } },
          ],
        },
      ],
    },
    key,
  )
  return data.choices[0].message.content
}

async function zenResponses(model: string, image: string, mime: string, prompt: string): Promise<string> {
  const key = zenKey()
  if (!key) throw new Error("no opencode zen api key")
  const data = await postJson(
    "https://opencode.ai/zen/v1/responses",
    {
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "input_image", image_url: `data:${mime};base64,${image}` },
          ],
        },
      ],
    },
    key,
  )
  const message = data.output?.find((o: any) => o.type === "message")
  return message?.content?.find((c: any) => c.type === "output_text")?.text ?? ""
}

export default tool({
  description:
    "Analyze an image or screenshot and return a text description: visible text, UI elements, layout, errors. Use when you need to see what is in an image file.",
  args: {
    path: tool.schema.string().describe("Absolute path to the image file"),
    prompt: tool.schema
      .string()
      .optional()
      .describe("Optional specific question about the image"),
  },
  async execute(args) {
    const image = readFileSync(args.path).toString("base64")
    const mime = mimeOf(args.path)
    const prompt = args.prompt ?? DEFAULT_PROMPT

    const backends = [
      () => ollama(image, prompt),
      () => zenChat("mimo-v2.5-free", image, mime, prompt),
      () => zenResponses("gpt-5-nano", image, mime, prompt),
    ]
    for (const backend of backends) {
      try {
        return await backend()
      } catch (e) {
        console.error("vision backend failed:", (e as Error).message)
      }
    }
    throw new Error("all vision backends failed")
  },
})
