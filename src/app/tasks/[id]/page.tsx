import { Suspense } from "react"
import TaskScreen, { TaskFallback } from "./task-screen"

export function generateStaticParams() {
  return [{ id: "_" }]
}

export default function TaskPage() {
  return (
    <Suspense fallback={<TaskFallback />}>
      <TaskScreen />
    </Suspense>
  )
}
