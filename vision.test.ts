import { describe, expect, it } from "bun:test"
import VisionPlugin, { contains, errorMessage, mimeOf } from "./vision"

describe("plugin structure", () => {
  it("exports a callable plugin with the vision tool and hooks", async () => {
    const hooks = await VisionPlugin({} as Parameters<typeof VisionPlugin>[0])
    expect(hooks.tool?.vision).toBeTruthy()
    expect(typeof hooks["chat.message"]).toBe("function")
    expect(typeof hooks["tool.execute.after"]).toBe("function")
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
