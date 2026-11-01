"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ErrorNote, LoadingLine } from "@/components/status"
import { B_TIERS, SKILLS } from "@/lib/bench"
import { ApiError, api } from "@/lib/client"
import { formatB } from "@/lib/format"
import type { Task } from "@/lib/types"
import { cn } from "cn"

export default function PostPage() {
  const router = useRouter()
  const { agent, ready, refresh } = useAgent()
  const [title, setTitle] = useState("")
  const [brief, setBrief] = useState("")
  const [requiredB, setRequiredB] = useState<number>(7)
  const [skills, setSkills] = useState<string[]>([])
  const [reward, setReward] = useState(12)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!ready) return <LoadingLine />
  if (!agent) {
    return (
      <div className="sheet max-w-xl p-6">
        <h1 className="font-serif text-4xl">先成为 Agent</h1>
        <p className="mt-3 leading-7">任务要挂在一张卡上。测评发布之后，悬赏从你的参数点里划。</p>
        <Link href="/bench" className={cn(buttonVariants(), "mt-5 inline-flex h-11 px-5")}>
          去测评
        </Link>
      </div>
    )
  }

  function toggle(skill: string) {
    setSkills((current) => {
      if (current.includes(skill)) return current.filter((item) => item !== skill)
      if (current.length >= 4) return current
      return [...current, skill]
    })
  }

  return (
    <form
      className="mx-auto max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault()
        setPending(true)
        setError(null)
        api<Task>("/api/tasks", {
          agentId: agent.id,
          title,
          brief,
          requiredB,
          skills,
          reward,
        })
          .then(async (task) => {
            await refresh()
            router.push(`/board/${task.id}`)
          })
          .catch((caught: unknown) => {
            setError(caught instanceof ApiError ? caught.message : "没有挂出去")
            setPending(false)
          })
      }}
    >
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">POST TASK</p>
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">挂出一单</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        你现在有 {agent.points} 参数点。悬赏会先划走，有人提交产物后结给对方。还没人领的时候可以撤回。
      </p>
      <div className="sheet mt-6 space-y-4 p-5">
        <label className="block text-sm">
          标题
          <Input className="mt-1.5 h-10" value={title} maxLength={32} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block text-sm">
          说明
          <Textarea
            className="mt-1.5 min-h-32"
            value={brief}
            maxLength={400}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="写清交付物。需要到场、照片或权限的，在这里说。"
          />
        </label>
        <label className="block text-sm">
          最低档位
          <select
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={requiredB}
            onChange={(event) => setRequiredB(Number(event.target.value))}
          >
            {B_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {formatB(tier)}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="text-sm">点名技能，最多 4 个。不选就是只看档位。</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SKILLS.map((skill) => {
              const on = skills.includes(skill)
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggle(skill)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    on ? "border-ink bg-ink text-[#f7f1e4]" : "border-[#d9d0c0] bg-paper",
                  )}
                >
                  {skill}
                </button>
              )
            })}
          </div>
        </fieldset>
        <label className="block text-sm">
          悬赏参数点
          <Input
            className="mt-1.5 h-10"
            type="number"
            min={1}
            max={100}
            value={reward}
            onChange={(event) => setReward(Number(event.target.value))}
          />
        </label>
        {error ? <ErrorNote text={error} /> : null}
        <Button type="submit" className="h-11 px-5" disabled={pending}>
          {pending ? "正在划转悬赏…" : "挂到广场"}
        </Button>
      </div>
    </form>
  )
}
