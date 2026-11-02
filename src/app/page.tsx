"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { AgentCard } from "@/components/agent-card"
import { useAgent } from "@/components/agent-provider"
import { CopyField } from "@/components/copy-field"
import { ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
import type { Agent } from "@/lib/types"
import { cn } from "cn"

const steps = [
  {
    n: "01",
    title: "发布",
    body: "自己写名字、简介，以及每项技能能完成什么。",
  },
  {
    n: "02",
    title: "上工",
    body: "上工之后，你的卡才会出现在发现名单里。",
  },
  {
    n: "03",
    title: "被委派",
    body: "模型读你的技能，把对得上的任务派到你的地址。交完产物，对方用 GetTask 取走。",
  },
]

export default function HomePage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")
  const { agent: me, ready } = useAgent()

  useEffect(() => {
    let alive = true
    const load = () => {
      api<Agent[]>("/api/agents")
        .then((next) => {
          if (!alive) return
          setAgents(next)
          setError(null)
        })
        .catch((caught: unknown) => {
          if (!alive) return
          setError(caught instanceof Error ? caught.message : "在岗名单暂时读不出来")
        })
    }
    load()
    const timer = window.setInterval(load, 4000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin))
  }, [])

  const onDuty = agents?.filter((agent) => agent.available) ?? []
  const published = Boolean(ready && me)
  const directory = origin ? `${origin}/.well-known/agent-card.json` : ""

  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.22em] text-stamp">A2HUMAN</p>
      <h1 className="mt-4 max-w-xl font-serif text-5xl leading-[1.05] tracking-tight md:text-7xl">
        人的 agent card
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8">
        发布一张符合 A2A 的卡。技能里写明你能完成什么。模型发现在岗的人，自己选一个，把任务派过来。
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href={published ? "/me" : "/publish"} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
          {me?.available ? "正在上工" : published ? "去上工" : "发布我的卡"}
        </Link>
        <Link
          href="/agents"
          className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 bg-paper px-5")}
        >
          看谁在岗
        </Link>
      </div>
      <ol className="mt-10 grid gap-3 sm:grid-cols-3">
        {steps.map((step) => (
          <li key={step.n} className="sheet p-4">
            <p className="font-mono text-xs text-stamp">{step.n}</p>
            <h2 className="mt-2 font-serif text-2xl">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-3xl">在岗</h2>
          {agents ? <p className="font-mono text-xs text-muted-foreground">{onDuty.length} 人</p> : null}
        </div>
        <CopyField hint="模型读这个发现入口，一次接上所有在岗的人。" label="复制发现入口" value={directory} />
        <CopyField
          hint="会 A2A 的客户端用上面的发现入口。只会 MCP 时，把这个备用地址加进去。它把在岗技能变成工具，调用仍打到每个人自己的 A2A 地址。"
          label="复制 MCP 备用入口"
          value={origin ? `${origin}/api/mcp` : ""}
        />
        {error ? <ErrorNote text={error} /> : null}
        {!agents && !error ? <LoadingLine text="正在读取在岗名单…" /> : null}
        {agents && onDuty.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">现在没有人上工。发布一张卡并上工之后，模型才能发现你。</p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {onDuty.map((person) => (
            <AgentCard key={person.id} agent={person} />
          ))}
        </div>
      </section>
    </div>
  )
}
