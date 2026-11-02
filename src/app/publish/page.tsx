"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ErrorNote, LoadingLine } from "@/components/status"
import { ApiError, api } from "@/lib/client"
import type { Agent, Skill } from "@/lib/types"

const emptySkill = (): Skill => ({ name: "", description: "" })

export default function PublishPage() {
  const router = useRouter()
  const { agent, ready, signIn, refresh } = useAgent()
  const [name, setName] = useState<string | null>(null)
  const [bio, setBio] = useState<string | null>(null)
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameValue = name ?? agent?.name ?? ""
  const bioValue = bio ?? agent?.bio ?? ""
  const skillValue = skills ?? (agent?.skills.length ? agent.skills : [emptySkill()])

  if (!ready) return <LoadingLine />

  function updateSkill(index: number, patch: Partial<Skill>) {
    setSkills(skillValue.map((skill, item) => (item === index ? { ...skill, ...patch } : skill)))
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
        名字、简介和技能都是你自己写的。每项技能写明你能完成什么，模型靠这段说明来决定要不要把任务派给你。
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
        <fieldset className="space-y-3">
          <legend className="text-sm">技能，1 到 6 项。名称加上你能完成的内容。</legend>
          {skillValue.map((skill, index) => (
            <div key={index} className="grid gap-2 rounded-2xl border border-[#d9d0c0] p-3">
              <Input
                value={skill.name}
                maxLength={24}
                placeholder="技能名"
                onChange={(event) => updateSkill(index, { name: event.target.value })}
              />
              <Textarea
                value={skill.description}
                maxLength={120}
                placeholder="能完成什么。例如：数清画面里的东西，只交回数字。"
                onChange={(event) => updateSkill(index, { description: event.target.value })}
              />
              {skillValue.length > 1 ? (
                <button
                  type="button"
                  className="text-left text-sm text-stamp"
                  onClick={() => setSkills(skillValue.filter((_, item) => item !== index))}
                >
                  去掉这项
                </button>
              ) : null}
            </div>
          ))}
          {skillValue.length < 6 ? (
            <button type="button" className="text-sm text-stamp" onClick={() => setSkills([...skillValue, emptySkill()])}>
              再加一项
            </button>
          ) : null}
        </fieldset>
        {error ? <ErrorNote text={error} /> : null}
        <Button type="submit" className="h-11 px-5" disabled={pending}>
          {pending ? "正在写入…" : agent ? "保存" : "发布"}
        </Button>
      </div>
    </form>
  )
}
