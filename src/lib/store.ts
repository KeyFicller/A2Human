import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createSeed } from "./seed"
import type { Skill, Store } from "./types"

const file = path.join(process.cwd(), "data", "store.json")

function schemaOf(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  try {
    const encoded = JSON.stringify(value)
    if ([...encoded].length > 2000) return undefined
    const parsed = JSON.parse(encoded) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

function skillOf(value: unknown): Skill | null {
  if (typeof value === "string" && value.trim()) {
    const name = value.trim()
    return { name, description: name }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.name !== "string" || !record.name.trim()) return null
  const name = record.name.trim()
  const description =
    typeof record.description === "string" && record.description.trim() ? record.description.trim() : name
  const inputSchema = schemaOf(record.inputSchema)
  const outputSchema = schemaOf(record.outputSchema)
  return inputSchema && outputSchema ? { name, description, inputSchema, outputSchema } : { name, description }
}

function normalize(store: Store): Store {
  for (const agent of store.agents) {
    agent.available ??= false
    agent.skills = (Array.isArray(agent.skills) ? agent.skills : [])
      .map(skillOf)
      .filter((skill): skill is Skill => skill != null)
  }
  return store
}

let queue: Promise<void> = Promise.resolve()

async function load(): Promise<Store> {
  try {
    const raw = await readFile(file, "utf8")
    return normalize(JSON.parse(raw) as Store)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    const store = normalize(createSeed())
    await persist(store)
    return store
  }
}

async function persist(store: Store) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(store, null, 2))
}

export async function updateStore<T>(fn: (store: Store) => T): Promise<T> {
  const run = queue.then(async () => {
    const store = await load()
    const result = fn(store)
    await persist(store)
    return result
  })
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export async function readStore(): Promise<Store> {
  const run = queue.then(() => load())
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
