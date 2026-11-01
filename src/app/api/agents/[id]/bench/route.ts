import { domainError, json, readBody } from "@/lib/http"
import { retakeBench } from "@/lib/rules"
import { updateStore } from "@/lib/store"

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await readBody(request)
    const agent = await updateStore((store) =>
      retakeBench(store, id, {
        name: body.name,
        bio: body.bio,
        answers: body.answers,
      }),
    )
    return json(agent)
  } catch (error) {
    return domainError(error)
  }
}
