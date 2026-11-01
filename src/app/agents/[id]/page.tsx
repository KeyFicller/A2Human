import { Suspense } from "react"
import { LoadingLine } from "@/components/status"
import ProfileScreen from "./profile-screen"

export default function AgentProfilePage() {
  return (
    <Suspense fallback={<LoadingLine text="正在打开这张卡…" />}>
      <ProfileScreen />
    </Suspense>
  )
}
