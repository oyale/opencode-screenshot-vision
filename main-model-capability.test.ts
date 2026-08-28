import { describe, expect, it } from "bun:test"
import { hasImageCapability, ModelVisionTracker } from "./main-model-capability"

function model(image?: boolean) {
  return { capabilities: { input: { image } } }
}

describe("hasImageCapability", () => {
  it("returns true when input.image is true", () => {
    expect(hasImageCapability(model(true))).toBe(true)
  })

  it("returns false when input.image is false", () => {
    expect(hasImageCapability(model(false))).toBe(false)
  })

  it("returns false when capabilities are missing", () => {
    expect(hasImageCapability({})).toBe(false)
  })
})

describe("ModelVisionTracker", () => {
  it("tracks a vision-capable model per session", () => {
    const tracker = new ModelVisionTracker()
    tracker.track(model(true), "ses_1")
    expect(tracker.hasVision("ses_1")).toBe(true)
  })

  it("tracks a text-only model as false", () => {
    const tracker = new ModelVisionTracker()
    tracker.track(model(false), "ses_1")
    expect(tracker.hasVision("ses_1")).toBe(false)
  })

  it("flips a session from vision to text-only when re-tracked", () => {
    const tracker = new ModelVisionTracker()
    tracker.track(model(true), "ses_1")
    tracker.track(model(false), "ses_1")
    expect(tracker.hasVision("ses_1")).toBe(false)
  })

  it("defaults unknown sessions to false", () => {
    expect(new ModelVisionTracker().hasVision("ses_unknown")).toBe(false)
  })

  it("evicts oldest sessions beyond the cap of 100", () => {
    const tracker = new ModelVisionTracker()
    for (let i = 0; i < 101; i++) tracker.track(model(true), `ses_${i}`)
    expect(tracker.hasVision("ses_0")).toBe(false)
    expect(tracker.hasVision("ses_100")).toBe(true)
  })
})
