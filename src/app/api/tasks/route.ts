import { domainError, json, readBody } from "@/lib/http"
import { postTask } from "@/lib/rules"
import { readStore, updateStore } from "@/lib/store"

export async function GET() {
  const store = await readStore()
  return json(store.tasks)
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request)
    const task = await updateStore((store) =>
      postTask(store, {
        agentId: body.agentId,
        title: body.title,
        brief: body.brief,
        skills: body.skills,
        reward: body.reward,
        dueHours: body.dueHours,
      }),
    )
    return json(task, 201)
  } catch (error) {
    return domainError(error)
  }
}
