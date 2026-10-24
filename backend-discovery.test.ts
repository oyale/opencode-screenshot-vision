import { describe, expect, it, beforeEach } from "bun:test"
import { getCandidates, clearCache, type ApiModel, type ApiProvider, type DiscoveryClient } from "./backend-discovery"

const LOCAL_URL = "http://localhost:11434/v1"
const ZEN_URL = "https://opencode.ai/zen/v1"

function model(
  id: string,
  options: {
    providerID?: string
    image?: boolean
    cost?: ReadonlyArray<{ input?: number; output?: number }>
    url?: string
    enabled?: boolean
  } = {},
): ApiModel {
  return {
    id,
    modelID: id,
    name: id,
    providerID: options.providerID ?? "ollama",
    capabilities: { input: options.image === false ? ["text"] : ["text", "image"] },
    cost: options.cost ?? [{ input: 0, output: 0 }],
    settings: options.url === undefined ? undefined : { baseURL: options.url },
    enabled: options.enabled,
  }
}

function client(providers: ApiProvider[], models: ApiModel[], integration?: DiscoveryClient["integration"]): DiscoveryClient {
  return {
    provider: { list: async () => ({ data: providers }) },
    model: { list: async () => ({ data: models }) },
    integration,
  }
}

describe("getCandidates", () => {
  beforeEach(() => {
    delete process.env.OPENCODE_VISION_LOCAL_MODEL
    delete process.env.OPENCODE_VISION_OLLAMA_MODEL
    clearCache()
  })

  it("filters out models without image capability", async () => {
    const c = client([{ id: "ollama" }], [model("qwen3", { image: false }), model("gemma4:e4b", { url: LOCAL_URL })])
    expect((await getCandidates(c)).map((x) => x.model)).toEqual(["gemma4:e4b"])
  })

  it("skips disabled and deprecated models", async () => {
    const c = client(
      [{ id: "ollama" }],
      [
        model("disabled", { url: LOCAL_URL, enabled: false }),
        { ...model("deprecated", { url: LOCAL_URL }), status: "deprecated" },
        model("active", { url: LOCAL_URL }),
      ],
    )
    expect((await getCandidates(c)).map((x) => x.model)).toEqual(["active"])
  })

  it("orders local first, then free, then cost", async () => {
    const c = client(
      [{ id: "ollama" }, { id: "zen", settings: { baseURL: ZEN_URL } }],
      [
        model("paid-big", { providerID: "zen", cost: [{ input: 1, output: 2 }] }),
        model("free", { providerID: "zen" }),
        model("local", { url: LOCAL_URL }),
      ],
    )
    expect((await getCandidates(c)).map((x) => x.model)).toEqual(["local", "free", "paid-big"])
  })

  it("falls back to the provider base URL when the model has none", async () => {
    const c = client([{ id: "ollama", settings: { baseURL: LOCAL_URL } }], [model("gemma4:e4b")])
    expect(await getCandidates(c)).toMatchObject([{ model: "gemma4:e4b", url: LOCAL_URL, local: true }])
  })

  it("skips models whose provider exposes no base URL", async () => {
    const c = client([{ id: "ollama" }], [model("gemma4:e4b")])
    expect(await getCandidates(c)).toEqual([])
  })

  it("prepends the env-pinned local model as candidate[0]", async () => {
    process.env.OPENCODE_VISION_LOCAL_MODEL = "gemma4:e4b"
    const c = client([{ id: "ollama" }], [model("other", { url: LOCAL_URL })])
    expect((await getCandidates(c))[0]).toMatchObject({ model: "gemma4:e4b", url: LOCAL_URL })
  })

  it("honors the legacy OPENCODE_VISION_OLLAMA_MODEL env pin", async () => {
    process.env.OPENCODE_VISION_OLLAMA_MODEL = "gemma4:e4b"
    const c = client([{ id: "ollama" }], [model("other", { url: LOCAL_URL })])
    expect((await getCandidates(c))[0]).toMatchObject({ model: "gemma4:e4b", url: LOCAL_URL })
  })

  it("dedupes the env pin when the same model is also discovered", async () => {
    process.env.OPENCODE_VISION_LOCAL_MODEL = "gemma4:e4b"
    const c = client([{ id: "ollama" }], [model("gemma4:e4b", { url: LOCAL_URL }), model("other", { url: LOCAL_URL })])
    const candidates = await getCandidates(c)
    expect(candidates[0]).toMatchObject({ model: "gemma4:e4b", url: LOCAL_URL })
    expect(candidates.filter((x) => x.model === "gemma4:e4b" && x.url === LOCAL_URL)).toHaveLength(1)
  })

  it("ties break alphabetically by name within the same bucket", async () => {
    const c = client([{ id: "zen", settings: { baseURL: ZEN_URL } }], [model("zeta-free", { providerID: "zen" }), model("alpha-free", { providerID: "zen" })])
    expect((await getCandidates(c)).map((x) => x.model)).toEqual(["alpha-free", "zeta-free"])
  })

  it("sorts a model with no input cost after costed models in the non-free bucket", async () => {
    const c = client(
      [{ id: "zen", settings: { baseURL: ZEN_URL } }],
      [model("costed", { providerID: "zen", cost: [{ input: 2, output: 2 }] }), model("uncosted", { providerID: "zen", cost: [{ output: 2 }] })],
    )
    const candidates = await getCandidates(c)
    expect(candidates.map((x) => x.model)).toEqual(["costed", "uncosted"])
  })

  it("resolves provider credentials through integrations", async () => {
    const c = client([{ id: "acme", settings: { baseURL: LOCAL_URL }, integrationID: "acme" }], [model("vision", { providerID: "acme" })], {
      connection: {
        active: async (id: string) => ({ id }),
        resolve: async () => ({ type: "key", key: "sk-test" }),
      },
    })
    expect((await getCandidates(c))[0]).toMatchObject({ auth: "sk-test" })
  })

  it("leaves auth unset when the integration has no key credential", async () => {
    const c = client([{ id: "acme", settings: { baseURL: LOCAL_URL }, integrationID: "acme" }], [model("vision", { providerID: "acme" })], {
      connection: {
        active: async () => undefined,
        resolve: async () => undefined,
      },
    })
    expect(await getCandidates(c)).toMatchObject([{ auth: undefined }])
  })

  it("caches within TTL and re-discovers after clearCache", async () => {
    let calls = 0
    const c: DiscoveryClient = {
      provider: { list: async () => ({ data: [{ id: "ollama" }] }) },
      model: {
        list: async () => {
          calls++
          return { data: [model("gemma4:e4b", { url: LOCAL_URL })] }
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

  it("returns an empty list when discovery throws", async () => {
    const c: DiscoveryClient = {
      provider: {
        list: async () => {
          throw new Error("boom")
        },
      },
      model: { list: async () => ({ data: [] }) },
    }
    expect(await getCandidates(c)).toEqual([])
  })

  it("returns an empty list when provider.list resolves without data", async () => {
    const c: DiscoveryClient = { provider: { list: async () => ({ data: undefined }) }, model: { list: async () => ({ data: [] }) } }
    expect(await getCandidates(c)).toEqual([])
  })

  it("skips null and malformed model entries", async () => {
    const c = client(
      [{ id: "ollama" }],
      [null as never, model("gemma4:e4b", { url: LOCAL_URL }), { id: "no-provider" } as never],
    )
    expect((await getCandidates(c)).map((x) => x.model)).toEqual(["gemma4:e4b"])
  })
})
