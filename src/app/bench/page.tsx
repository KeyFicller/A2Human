"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ErrorNote, LoadingLine } from "@/components/status"
import { QUESTIONS, defaultBio, scoreBench, type BenchResult } from "@/lib/bench"
import { ApiError, api } from "@/lib/client"
import { archLabel, formatB } from "@/lib/format"
import type { Agent } from "@/lib/types"
import { cn } from "cn"

export default function BenchPage() {
  const router = useRouter()
  const { agent, ready, signIn } = useAgent()
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [result, setResult] = useState<BenchResult | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [bio, setBio] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const question = QUESTIONS[index]
  const nameValue = name ?? agent?.name ?? ""
  const bioValue = bio ?? agent?.bio ?? (result ? defaultBio(result) : "")

  useEffect(() => {
    if (!ready || result) return
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return
      if (event.key === "Enter" && target?.tagName === "BUTTON") return
      if (!revealed && event.key >= "1" && event.key <= String(question.options.length)) {
        setPicked(Number(event.key) - 1)
        setRevealed(true)
      }
      if (event.key === "Enter" && revealed && picked != null) {
        const nextAnswers = [...answers, picked]
        setAnswers(nextAnswers)
        setPicked(null)
        setRevealed(false)
        if (nextAnswers.length === QUESTIONS.length) {
          const scored = scoreBench(nextAnswers)
          setResult(scored)
          if (!agent) setBio(null)
          return
        }
        setIndex((current) => current + 1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ready, result, revealed, picked, answers, question, agent])

  function choose(option: number) {
    if (revealed) return
    setPicked(option)
    setRevealed(true)
  }

  function next() {
    if (picked == null) return
    const nextAnswers = [...answers, picked]
    setAnswers(nextAnswers)
    setPicked(null)
    setRevealed(false)
    if (nextAnswers.length === QUESTIONS.length) {
      const scored = scoreBench(nextAnswers)
      setResult(scored)
      if (!agent) setBio(null)
      return
    }
    setIndex((current) => current + 1)
  }

  async function publish() {
    if (!result) return
    setPending(true)
    setError(null)
    try {
      const payload = { name: nameValue, bio: bioValue, answers }
      if (agent) {
        await api<Agent>(`/api/agents/${agent.id}/bench`, payload)
        await signIn(agent.id)
      } else {
        const created = await api<Agent>("/api/agents", payload)
        await signIn(created.id)
      }
      router.push("/me")
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "发布失败")
      setPending(false)
    }
  }

  if (!ready) return <LoadingLine text="正在确认你有没有已经发布…" />

  if (result) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6">
        <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">
          {result.correct}/{result.total}
        </p>
        <div className="sheet px-5 py-6 md:px-8">
          <p className="font-serif text-7xl leading-none text-stamp md:text-8xl">{formatB(result.paramsB)}</p>
          <p className="mt-4 text-lg leading-8">{result.blurb}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {archLabel(result.arch)} · {result.temperament}
            {result.arch === "moe" ? " · 简单计数会漏，难判断反而在" : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {result.skills.length === 0 ? (
              <Badge variant="outline">技能未点亮</Badge>
            ) : (
              result.skills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))
            )}
          </div>
        </div>
        <form
          className="sheet space-y-4 p-5 md:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            void publish()
          }}
        >
          <div>
            <h2 className="font-serif text-3xl">{agent ? "更新这张卡" : "发布成 Agent"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {agent
                ? "重测会改参数量、架构和技能。参数点、已完成的单都还在。"
                : "发布后这张卡进入目录。起始 40 参数点，用来挂你自己的悬赏。"}
            </p>
          </div>
          <label className="block text-sm">
            名字
            <Input
              className="mt-1.5 h-10"
              value={nameValue}
              maxLength={16}
              onChange={(event) => setName(event.target.value)}
              placeholder="两个字就够"
            />
          </label>
          <label className="block text-sm">
            简介
            <Textarea
              className="mt-1.5 min-h-24"
              value={bioValue}
              maxLength={80}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          {error ? <ErrorNote text={error} /> : null}
          <Button type="submit" className="h-11 px-5" disabled={pending}>
            {pending ? "正在写入协议…" : agent ? "更新 Agent Card" : "发布到目录"}
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">
          {String(index + 1).padStart(2, "0")} / {String(QUESTIONS.length).padStart(2, "0")}
        </p>
        <p className="text-xs text-muted-foreground">数字键 1–4 作答，回车下一题</p>
      </div>
      <div className="mt-3 h-1 bg-[#e4d8c4]">
        <div
          className="h-full bg-stamp"
          style={{ width: `${(index / QUESTIONS.length) * 100}%` }}
        />
      </div>
      <h1 className="mt-8 font-serif text-3xl leading-snug md:text-5xl">{question.prompt}</h1>
      <div className="mt-6 grid gap-2">
        {question.options.map((option, optionIndex) => {
          const correct = optionIndex === question.answer
          const selected = picked === optionIndex
          return (
            <button
              key={option}
              type="button"
              onClick={() => choose(optionIndex)}
              className={cn(
                "sheet px-4 py-3 text-left text-base leading-7",
                !revealed && "hover:-translate-y-0.5",
                revealed && selected && correct && "border-moss text-moss",
                revealed && selected && !correct && "border-stamp text-stamp",
                revealed && !selected && correct && "border-moss",
              )}
            >
              <span className="mr-3 font-mono text-xs text-muted-foreground">{optionIndex + 1}</span>
              {option}
            </button>
          )
        })}
      </div>
      {revealed ? (
        <div className="mt-5">
          <p className="text-sm leading-6">{question.note}</p>
          <Button type="button" className="mt-4 h-11 px-5" onClick={next}>
            {index === QUESTIONS.length - 1 ? "看我是几 B" : "下一题"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
