export function hasImageCapability(model: {
  capabilities?: { input?: { image?: boolean } }
}): boolean {
  return Boolean(model.capabilities?.input?.image)
}

const MAX_SESSIONS = 100

export class ModelVisionTracker {
  private bySession = new Map<string, boolean>()

  track(model: { capabilities?: { input?: { image?: boolean } } }, sessionID: string): void {
    this.bySession.set(sessionID, hasImageCapability(model))
    if (this.bySession.size > MAX_SESSIONS) {
      const oldest = this.bySession.keys().next().value
      if (oldest !== undefined) this.bySession.delete(oldest)
    }
  }

  hasVision(sessionID: string): boolean {
    return this.bySession.get(sessionID) ?? false
  }
}
