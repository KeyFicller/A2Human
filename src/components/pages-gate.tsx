"use client"

import { useEffect, useState } from "react"
import HomePage from "@/app/page"
import AgentsPage from "@/app/agents/page"
import MePage from "@/app/me/page"
import PublishPage from "@/app/publish/page"
import ProfileScreen from "@/app/agents/[id]/profile-screen"
import TaskScreen from "@/app/tasks/[id]/task-screen"
import { appHref, pagesExport, storedPagesPath } from "@/lib/paths"

function Screen({ path }: { path: string }) {
  if (path === "/agents") return <AgentsPage />
  if (path === "/me") return <MePage />
  if (path === "/publish") return <PublishPage />
  const agent = /^\/agents\/([^/]+)$/.exec(path)
  if (agent) return <ProfileScreen id={agent[1]} />
  const task = /^\/tasks\/([^/]+)$/.exec(path)
  if (task) return <TaskScreen id={task[1]} />
  return <HomePage />
}

export function PagesGate({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState<string | null>(null)
  useEffect(() => {
    if (!pagesExport) return
    const stored = storedPagesPath()
    if (!stored) return
    setPath(stored)
    History.prototype.replaceState.call(history, null, "", appHref(stored))
  }, [])
  if (!path) return children
  return <Screen path={path} />
}
