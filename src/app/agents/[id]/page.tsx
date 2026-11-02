import { Suspense } from "react"
import ProfileScreen, { ProfileFallback } from "./profile-screen"

export default function AgentProfilePage() {
  return (
    <Suspense fallback={<ProfileFallback />}>
      <ProfileScreen />
    </Suspense>
  )
}
