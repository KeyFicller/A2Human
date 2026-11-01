import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createSeed } from "./seed"
import type { Store } from "./types"

const file = path.join(process.cwd(), "data", "store.json")

let queue: Promise<void> = Promise.resolve()

async function load(): Promise<Store> {
  try {
    const raw = await readFile(file, "utf8")
    return JSON.parse(raw) as Store
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    const store = createSeed()
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
