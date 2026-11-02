import { json } from "@/lib/http"
import { readStore } from "@/lib/store"

export async function GET() {
  const store = await readStore()
  return json(store.tasks)
}
