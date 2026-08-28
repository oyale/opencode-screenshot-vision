import { describe, expect, it } from "bun:test"
import { VisionPlugin, contains, describe as describeImage, errorMessage, mimeOf, shouldAutoDescribe } from "./vision"

describe("plugin structure", () => {
  it("exports a callable plugin with the vision tool and hooks", async () => {
    const hooks = await VisionPlugin({} as Parameters<typeof VisionPlugin>[0])
    expect(hooks.tool?.vision).toBeTruthy()
    expect(typeof hooks["chat.message"]).toBe("function")
    expect(typeof hooks["tool.execute.after"]).toBe("function")
  })

  it("registers the chat.params hook", async () => {
    const hooks = await VisionPlugin({} as Parameters<typeof VisionPlugin>[0])
    expect(typeof hooks["chat.params"]).toBe("function")
  })
})

describe("shouldAutoDescribe", () => {
  it("never describes in off mode", () => {
    expect(shouldAutoDescribe("off", true)).toBe(false)
    expect(shouldAutoDescribe("off", false)).toBe(false)
  })

  it("always describes in append/replace even when the model sees", () => {
    expect(shouldAutoDescribe("append", true)).toBe(true)
    expect(shouldAutoDescribe("replace", true)).toBe(true)
  })

  it("skips in auto mode when the model sees", () => {
    expect(shouldAutoDescribe("auto", true)).toBe(false)
  })

  it("describes in auto mode when the model does not see", () => {
    expect(shouldAutoDescribe("auto", false)).toBe(true)
  })

  it("treats an unknown mode as auto", () => {
    expect(shouldAutoDescribe("bogus", true)).toBe(false)
  })
})

describe("mimeOf", () => {
  it("detects PNG by magic bytes", () => {
    expect(mimeOf(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]))).toBe("image/png")
  })

  it("detects JPEG by magic bytes", () => {
    expect(mimeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg")
  })

  it("detects GIF by magic bytes", () => {
    const bytes = new Uint8Array([...Buffer.from("GIF89a"), 0, 0, 0, 0])
    expect(mimeOf(bytes)).toBe("image/gif")
  })

  it("detects WebP by magic bytes", () => {
    const bytes = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")])
    expect(mimeOf(bytes)).toBe("image/webp")
  })

  it("rejects an unsupported format", () => {
    expect(() => mimeOf(new Uint8Array([1, 2, 3, 4]))).toThrow()
  })
})

describe("contains", () => {
  it("accepts a path inside the root", () => {
    expect(contains("/tmp/opencode", "/tmp/opencode/shot.png")).toBe(true)
  })

  it("rejects a path outside the root", () => {
    expect(contains("/tmp/opencode", "/tmp/other/shot.png")).toBe(false)
  })
})

describe("errorMessage", () => {
  it("stringifies an object without a message field", () => {
    expect(errorMessage({ code: "ConnectionRefused" })).toContain("ConnectionRefused")
  })
})

describe("describe fallback", () => {
  it("aggregates failures and clears the discovery cache so the next call re-fetches", async () => {
    let listCalls = 0
    const client = {
      provider: {
        list: async () => {
          listCalls++
          return {
            data: [
              {
                id: "mock",
                models: {
                  vision: {
                    id: "vision-model",
                    api: { url: "http://127.0.0.1:1/v1" },
                    capabilities: { input: { image: true } },
                  },
                },
              },
            ] as never,
          }
        },
      },
    }
    const image = { base64: "aGk=", mime: "image/png" }
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error("network unavailable")
    }) as unknown as typeof fetch
    try {
      await expect(describeImage(client as never, image, "prompt")).rejects.toThrow(/all vision backends failed/)
      expect(listCalls).toBe(1)
      await expect(describeImage(client as never, image, "prompt")).rejects.toThrow(/all vision backends failed/)
      expect(listCalls).toBe(2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
