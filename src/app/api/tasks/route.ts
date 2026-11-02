import { json } from "@/lib/http"
import { expireScores } from "@/lib/rules"
import { commitStore } from "@/lib/store"

export async function GET() {
  const store = await commitStore((store) => expireScores(store))
  return json(store.tasks)
}
