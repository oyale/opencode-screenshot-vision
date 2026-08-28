import { describe, expect, it, beforeEach } from 'bun:test'
import { getCandidates, clearCache, type DiscoveryClient } from './backend-discovery'

const LOCAL_URL = 'http://localhost:11434/v1'

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

const defaultModel = { id: 'gemma4:e4b', image: true }
const vision = (id: string, cost: { input: number; output: number }, url?: string) => ({ id, cost, url })

describe('getCandidates', () => {
  beforeEach(() => {
    delete process.env.OPENCODE_VISION_LOCAL_MODEL
    delete process.env.OPENCODE_VISION_OLLAMA_MODEL
    clearCache()
  })

  it('filters out models without image capability', async () => {
    const c = client([provider('ollama', [{ id: 'qwen3', image: false }, defaultModel])])
    const candidates = await getCandidates(c)
    expect(candidates.map((c) => c.model)).toEqual(['gemma4:e4b'])
  })

  it('orders local first, then free, then cost', async () => {
    const c = client([
      provider('zen', [
        vision('paid-big', { input: 1, output: 2 }, 'https://opencode.ai/zen/v1'),
        vision('free', { input: 0, output: 0 }, 'https://opencode.ai/zen/v1'),
      ]),
      provider('ollama', [vision('local', { input: 0, output: 0 }, LOCAL_URL)]),
    ])
    const candidates = await getCandidates(c)
    expect(candidates.map((c) => c.model)).toEqual(['local', 'free', 'paid-big'])
  })

  it('prepends the env-pinned local model as candidate[0]', async () => {
    process.env.OPENCODE_VISION_LOCAL_MODEL = 'gemma4:e4b'
    const c = client([provider('ollama', [vision('other', { input: 0, output: 0 }, LOCAL_URL)])])
    const candidates = await getCandidates(c)
    expect(candidates[0]).toMatchObject({ model: 'gemma4:e4b', url: LOCAL_URL })
  })

  it('caches within TTL and re-discovers after clearCache', async () => {
    let calls = 0
    const c: DiscoveryClient = {
      provider: {
        list: async () => {
          calls++
          return { data: [provider('ollama', [defaultModel])] as never }
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

  it('returns an empty list when provider.list throws', async () => {
    const c: DiscoveryClient = {
      provider: { list: async () => { throw new Error('boom') } },
    }
    expect(await getCandidates(c)).toEqual([])
  })
})
