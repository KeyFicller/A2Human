import { Suspense } from "react"
import TaskScreen, { TaskFallback } from "./task-screen"

export default function TaskPage() {
  return (
    <Suspense fallback={<TaskFallback />}>
      <TaskScreen />
    </Suspense>
  )
}
