interface ApiModel {
  id: string
  name?: string
  api: { url: string }
  capabilities?: { input?: { image?: boolean } }
  cost?: { input?: number; output?: number }
}

interface ApiProvider {
  id: string
  key?: string
  models: Record<string, ApiModel>
}

export interface DiscoveryClient {
  provider: { list(): Promise<{ data?: ApiProvider[] }> }
}

export interface BackendCandidate {
  providerID: string
  name: string
  url: string
  model: string
  auth?: string
  local: boolean
  free: boolean
  costInput: number
}

const LOCAL_URL = (process.env.OPENCODE_VISION_LOCAL_URL ?? "http://localhost:11434/v1").replace(/\/+$/, "")

const TTL_MS = 10 * 60 * 1000

let cache: { at: number; candidates: BackendCandidate[] } | undefined

function isLoopbackUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|::1/i.test(url)
}

function isFree(model: ApiModel): boolean {
  return (model.cost?.input ?? 0) === 0 && (model.cost?.output ?? 0) === 0
}

function pinnedLocalCandidate(): BackendCandidate | undefined {
  const model = process.env.OPENCODE_VISION_LOCAL_MODEL ?? process.env.OPENCODE_VISION_OLLAMA_MODEL
  if (!model) return undefined
  return { providerID: "env", name: `Local (${model})`, url: LOCAL_URL, model, local: true, free: true, costInput: 0 }
}

function sortCandidates(candidates: BackendCandidate[]): BackendCandidate[] {
  return candidates.sort(
    (a, b) =>
      Number(b.local) - Number(a.local) ||
      Number(b.free) - Number(a.free) ||
      a.costInput - b.costInput ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  )
}

export async function getCandidates(client: DiscoveryClient): Promise<BackendCandidate[]> {
  const pin = pinnedLocalCandidate()
  if (cache && Date.now() - cache.at < TTL_MS) return pin ? [pin, ...cache.candidates] : cache.candidates

  try {
    const providers = (await client.provider.list()).data ?? []
    const discovered: BackendCandidate[] = []
    for (const provider of providers) {
      if (typeof provider.models !== "object" || provider.models === null) continue
      for (const model of Object.values(provider.models)) {
        if (!model.capabilities?.input?.image || !model.api?.url) continue
        discovered.push({
          providerID: provider.id,
          name: model.name ?? model.id,
          url: model.api.url,
          model: model.id,
          auth: provider.key,
          local: isLoopbackUrl(model.api.url),
          free: isFree(model),
          costInput: model.cost?.input ?? Infinity,
        })
      }
    }
    cache = { at: Date.now(), candidates: sortCandidates(discovered) }
  } catch {
    cache = { at: Date.now(), candidates: [] }
  }
  return pin ? [pin, ...cache.candidates] : cache.candidates
}

export function clearCache(): void {
  cache = undefined
}
