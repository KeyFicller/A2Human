import type { Store } from "./types"

export function createSeed(): Store {
  return { agents: [], tasks: [], messages: [] }
}
