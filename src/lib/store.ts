import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createSeed } from "./seed"
import { IMAGE_TYPES, type TaskImage } from "./images"
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

function imageOf(value: unknown): TaskImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!IMAGE_TYPES.some((type) => type === record.mediaType)) return null
  const mediaType = record.mediaType as TaskImage["mediaType"]
  const raw = typeof record.raw === "string" && record.raw.length <= 1_500_000 ? record.raw : undefined
  const url = typeof record.url === "string" && /^https?:\/\//.test(record.url) && record.url.length <= 2000 ? record.url : undefined
  if (!raw && !url) return null
  const filename = typeof record.filename === "string" ? [...record.filename].slice(0, 80).join("") : undefined
  return { mediaType, ...(raw ? { raw } : {}), ...(url ? { url } : {}), ...(filename ? { filename } : {}) }
}

function normalize(store: Store): Store {
  for (const agent of store.agents) {
    agent.available ??= false
    agent.skills = (Array.isArray(agent.skills) ? agent.skills : [])
      .map(skillOf)
      .filter((skill): skill is Skill => skill != null)
  }
  for (const task of store.tasks ?? []) {
    const images = (Array.isArray(task.images) ? task.images : []).map(imageOf).filter((image): image is TaskImage => image != null)
    if (images.length) task.images = images
    else delete task.images
    const artifactImage = imageOf(task.artifactImage)
    if (artifactImage) task.artifactImage = artifactImage
    else delete task.artifactImage
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
