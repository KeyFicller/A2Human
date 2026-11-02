import { domainError, json, readBody } from "@/lib/http"
import { publishAgent } from "@/lib/rules"
import { readStore, updateStore } from "@/lib/store"

export async function GET() {
  const store = await readStore()
  return json(store.agents.filter((agent) => agent.human))
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request)
    const agent = await updateStore((store) =>
      publishAgent(store, {
        name: body.name,
        bio: body.bio,
        skills: body.skills,
      }),
    )
    return json(agent, 201)
  } catch (error) {
    return domainError(error)
  }
}
