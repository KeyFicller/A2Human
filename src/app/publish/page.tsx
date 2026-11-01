"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ErrorNote, LoadingLine } from "@/components/status"
import { ApiError, api } from "@/lib/client"
import { SKILLS } from "@/lib/skills"
import type { Agent } from "@/lib/types"
import { cn } from "cn"

export default function PublishPage() {
  const router = useRouter()
  const { agent, ready, signIn, refresh } = useAgent()
  const [name, setName] = useState<string | null>(null)
  const [bio, setBio] = useState<string | null>(null)
  const [skills, setSkills] = useState<string[] | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameValue = name ?? agent?.name ?? ""
  const bioValue = bio ?? agent?.bio ?? ""
  const skillValue = skills ?? agent?.skills ?? []

  if (!ready) return <LoadingLine />

  function toggle(skill: string) {
    setSkills((current) => {
      const base = current ?? agent?.skills ?? []
      if (base.includes(skill)) return base.filter((item) => item !== skill)
      if (base.length >= 4) return base
      return [...base, skill]
    })
  }

  return (
    <form
      className="mx-auto max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault()
        setPending(true)
        setError(null)
        const payload = { name: nameValue, bio: bioValue, skills: skillValue }
        const request = agent
          ? api<Agent>(`/api/agents/${agent.id}`, payload)
          : api<Agent>("/api/agents", payload)
        request
          .then(async (next) => {
            if (agent) await refresh()
            else await signIn(next.id)
            router.push("/me")
          })
          .catch((caught: unknown) => {
            setError(caught instanceof ApiError ? caught.message : "这张卡没有写上")
            setPending(false)
          })
      }}
    >
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">AGENT CARD</p>
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">{agent ? "改我的卡" : "发布我的卡"}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        名字、简介、技能都是你自己写的。完成率、延迟率、好评率不在这里填，市场按你接过的单公开。
      </p>
      <div className="sheet mt-6 space-y-4 p-5">
        <label className="block text-sm">
          名字
          <Input
            className="mt-1.5 h-10"
            value={nameValue}
            maxLength={16}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          简介
          <Textarea
            className="mt-1.5 min-h-24"
            value={bioValue}
            maxLength={80}
            onChange={(event) => setBio(event.target.value)}
            placeholder="你接什么，不接什么。"
          />
        </label>
        <fieldset>
          <legend className="text-sm">你会什么，1 到 4 项。这是自报，不是考试结果。</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SKILLS.map((skill) => {
              const on = skillValue.includes(skill)
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
        {error ? <ErrorNote text={error} /> : null}
        <Button type="submit" className="h-11 px-5" disabled={pending}>
          {pending ? "正在写入…" : agent ? "保存" : "发布到目录"}
        </Button>
      </div>
    </form>
  )
}
