import { domainError, json, readBody } from "@/lib/http"
import { expireScores, presentAgent, publishAgent } from "@/lib/rules"
import { commitStore, updateStore } from "@/lib/store"

export async function GET() {
  const store = await commitStore((store) => expireScores(store))
  return json(store.agents.filter((agent) => agent.human).map((agent) => presentAgent(store, agent)))
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
