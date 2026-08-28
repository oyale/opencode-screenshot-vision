import { describe, expect, it, beforeEach } from "bun:test"
import { getCandidates, clearCache, type DiscoveryClient } from "./backend-discovery"

const LOCAL_URL = "http://localhost:11434/v1"

function provider(
  id: string,
  models: Array<{
    id: string
    image?: boolean
    cost?: { input: number; output: number }
    url?: string
  }>,
  key?: string,
) {
  return {
    id,
    key,
    models: Object.fromEntries(
      models.map((m) => [
        m.id,
        {
          id: m.id,
          name: m.id,
          api: { url: m.url ?? LOCAL_URL },
          capabilities: { input: { image: m.image ?? true } },
          cost: m.cost ?? { input: 0, output: 0 },
        },
      ]),
    ),
  }
}

function client(providers: unknown[]): DiscoveryClient {
  return { provider: { list: async () => ({ data: providers as never }) } }
}

const defaultModel = { id: "gemma4:e4b", image: true }
const vision = (id: string, cost: { input: number; output: number }, url?: string) => ({ id, cost, url })

describe("getCandidates", () => {
  beforeEach(() => {
    delete process.env.OPENCODE_VISION_LOCAL_MODEL
    delete process.env.OPENCODE_VISION_OLLAMA_MODEL
    clearCache()
  })

  it("filters out models without image capability", async () => {
    const c = client([provider("ollama", [{ id: "qwen3", image: false }, defaultModel])])
    const candidates = await getCandidates(c)
    expect(candidates.map((c) => c.model)).toEqual(["gemma4:e4b"])
  })

  it("orders local first, then free, then cost", async () => {
    const c = client([
      provider("zen", [
        vision("paid-big", { input: 1, output: 2 }, "https://opencode.ai/zen/v1"),
        vision("free", { input: 0, output: 0 }, "https://opencode.ai/zen/v1"),
      ]),
      provider("ollama", [vision("local", { input: 0, output: 0 }, LOCAL_URL)]),
    ])
    const candidates = await getCandidates(c)
    expect(candidates.map((c) => c.model)).toEqual(["local", "free", "paid-big"])
  })

  it("prepends the env-pinned local model as candidate[0]", async () => {
    process.env.OPENCODE_VISION_LOCAL_MODEL = "gemma4:e4b"
    const c = client([provider("ollama", [vision("other", { input: 0, output: 0 }, LOCAL_URL)])])
    const candidates = await getCandidates(c)
    expect(candidates[0]).toMatchObject({ model: "gemma4:e4b", url: LOCAL_URL })
  })

  it("honors the legacy OPENCODE_VISION_OLLAMA_MODEL env pin", async () => {
    process.env.OPENCODE_VISION_OLLAMA_MODEL = "gemma4:e4b"
    const c = client([provider("ollama", [vision("other", { input: 0, output: 0 }, LOCAL_URL)])])
    const candidates = await getCandidates(c)
    expect(candidates[0]).toMatchObject({ model: "gemma4:e4b", url: LOCAL_URL })
  })

  it("dedupes the env pin when the same model is also discovered", async () => {
    process.env.OPENCODE_VISION_LOCAL_MODEL = "gemma4:e4b"
    const c = client([
      provider("ollama", [
        vision("gemma4:e4b", { input: 0, output: 0 }, LOCAL_URL),
        vision("other", { input: 0, output: 0 }, LOCAL_URL),
      ]),
    ])
    const candidates = await getCandidates(c)
    expect(candidates[0]).toMatchObject({ model: "gemma4:e4b", url: LOCAL_URL })
    expect(candidates.filter((x) => x.model === "gemma4:e4b" && x.url === LOCAL_URL)).toHaveLength(1)
  })

  it("ties break alphabetically by name within the same bucket", async () => {
    const c = client([
      provider("zen", [
        vision("zeta-free", { input: 0, output: 0 }, "https://opencode.ai/zen/v1"),
        vision("alpha-free", { input: 0, output: 0 }, "https://opencode.ai/zen/v1"),
      ]),
    ])
    const candidates = await getCandidates(c)
    expect(candidates.map((x) => x.model)).toEqual(["alpha-free", "zeta-free"])
  })

  it("sorts a model with no input cost after costed models in the non-free bucket", async () => {
    const c = client([
      {
        id: "zen",
        models: {
          costed: {
            id: "costed",
            name: "costed",
            api: { url: "https://opencode.ai/zen/v1" },
            capabilities: { input: { image: true } },
            cost: { input: 2, output: 2 },
          },
          uncosted: {
            id: "uncosted",
            name: "uncosted",
            api: { url: "https://opencode.ai/zen/v1" },
            capabilities: { input: { image: true } },
            cost: { output: 2 },
          },
        },
      },
    ])
    const candidates = await getCandidates(c)
    expect(candidates.map((x) => x.model)).toEqual(["costed", "uncosted"])
  })

  it("caches within TTL and re-discovers after clearCache", async () => {
    let calls = 0
    const c: DiscoveryClient = {
      provider: {
        list: async () => {
          calls++
          return { data: [provider("ollama", [defaultModel])] as never }
        },
      },
    }
    await getCandidates(c)
    await getCandidates(c)
    expect(calls).toBe(1)
    clearCache()
    await getCandidates(c)
    expect(calls).toBe(2)
  })

  it("returns an empty list when provider.list throws", async () => {
    const c: DiscoveryClient = {
      provider: { list: async () => { throw new Error("boom") } },
    }
    expect(await getCandidates(c)).toEqual([])
  })

  it("returns an empty list when provider.list resolves without data", async () => {
    const c: DiscoveryClient = { provider: { list: async () => ({ data: undefined }) } }
    expect(await getCandidates(c)).toEqual([])
  })

  it("skips null entries inside the models map", async () => {
    const c = client([
      {
        id: "mixed",
        models: {
          good: {
            id: "gemma4:e4b",
            name: "gemma4:e4b",
            api: { url: LOCAL_URL },
            capabilities: { input: { image: true } },
            cost: { input: 0, output: 0 },
          },
          nope: null,
        },
      },
    ])
    const candidates = await getCandidates(c)
    expect(candidates.map((x) => x.model)).toEqual(["gemma4:e4b"])
  })

  it("skips malformed models instead of failing all discovery", async () => {
    const c = client([
      {
        id: "broken",
        models: {
          noApi: { id: "no-api", capabilities: { input: { image: true } } },
          good: {
            id: "gemma4:e4b",
            name: "gemma4:e4b",
            api: { url: LOCAL_URL },
            capabilities: { input: { image: true } },
            cost: { input: 0, output: 0 },
          },
        },
      },
      { id: "junk", models: "not-an-object" },
    ])
    const candidates = await getCandidates(c)
    expect(candidates.map((c) => c.model)).toEqual(["gemma4:e4b"])
  })
})
