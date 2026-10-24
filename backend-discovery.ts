import { hasImageCapability } from "./main-model-capability"

export interface ApiModel {
  id: string
  modelID?: string
  name?: string
  providerID: string
  capabilities?: { input?: readonly string[] }
  cost?: ReadonlyArray<{ input?: number; output?: number }>
  settings?: { baseURL?: string }
  enabled?: boolean
  status?: string
}

export interface ApiProvider {
  id: string
  settings?: { baseURL?: string }
  integrationID?: string
}

export interface DiscoveryClient {
  provider: { list(): Promise<{ data?: readonly ApiProvider[] }> }
  model: { list(): Promise<{ data?: readonly ApiModel[] }> }
  integration?: {
    connection: {
      active(integrationID: string): Promise<any>
      resolve(connection: any): Promise<{ type?: string; key?: string } | undefined>
    }
  }
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
  return (model.cost ?? []).every((tier) => (tier.input ?? 0) === 0 && (tier.output ?? 0) === 0)
}

function inputCost(model: ApiModel): number {
  return Math.min(...(model.cost ?? []).map((tier) => tier.input ?? Infinity))
}

function baseUrl(model: ApiModel, provider: ApiProvider | undefined): string | undefined {
  const url = model.settings?.baseURL ?? provider?.settings?.baseURL
  return typeof url === "string" && url ? url.replace(/\/+$/, "") : undefined
}

async function providerKey(client: DiscoveryClient, provider: ApiProvider): Promise<string | undefined> {
  if (!provider.integrationID || !client.integration) return undefined
  try {
    const active = await client.integration.connection.active(provider.integrationID)
    if (!active) return undefined
    const credential = await client.integration.connection.resolve(active)
    return credential?.type === "key" && credential.key ? credential.key : undefined
  } catch {
    return undefined
  }
}

function pinnedLocalCandidate(): BackendCandidate | undefined {
  const model = process.env.OPENCODE_VISION_LOCAL_MODEL ?? process.env.OPENCODE_VISION_OLLAMA_MODEL
  if (!model) return undefined
  return { providerID: "env", name: `Local (${model})`, url: LOCAL_URL, model, local: true, free: true, costInput: 0 }
}

function withPin(candidates: BackendCandidate[], pin: BackendCandidate | undefined): BackendCandidate[] {
  if (!pin) return candidates
  return [pin, ...candidates.filter((c) => !(c.url === pin.url && c.model === pin.model))]
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
  if (cache && Date.now() - cache.at < TTL_MS) return withPin(cache.candidates, pin)

  try {
    const providers = new Map(((await client.provider.list()).data ?? []).map((p) => [p.id, p]))
    const keys = new Map<string, string | undefined>()
    const discovered: BackendCandidate[] = []
    for (const model of (await client.model.list()).data ?? []) {
      if (!model || typeof model !== "object") continue
      if (!hasImageCapability(model)) continue
      if (model.enabled === false || model.status === "deprecated") continue

      const provider = providers.get(model.providerID)
      const url = baseUrl(model, provider)
      if (!url) continue
      if (!keys.has(model.providerID)) {
        keys.set(model.providerID, provider ? await providerKey(client, provider) : undefined)
      }

      const id = model.modelID ?? model.id
      discovered.push({
        providerID: model.providerID,
        name: model.name ?? id,
        url,
        model: id,
        auth: keys.get(model.providerID),
        local: isLoopbackUrl(url),
        free: isFree(model),
        costInput: inputCost(model),
      })
    }
    cache = { at: Date.now(), candidates: sortCandidates(discovered) }
  } catch {
    cache = { at: Date.now(), candidates: [] }
  }
  return withPin(cache.candidates, pin)
}

export function clearCache(): void {
  cache = undefined
}
