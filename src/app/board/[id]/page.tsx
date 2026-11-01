import { Suspense } from "react"
import { LoadingLine } from "@/components/status"
import TaskScreen from "./task-screen"

export default function TaskPage() {
  return (
    <Suspense fallback={<LoadingLine text="正在打开这张任务…" />}>
      <TaskScreen />
    </Suspense>
  )
}
