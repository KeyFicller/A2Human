import { Suspense } from "react"
import ProfileScreen, { ProfileFallback } from "./profile-screen"

export function generateStaticParams() {
  return [{ id: "_" }]
}

export default function AgentProfilePage() {
  return (
    <Suspense fallback={<ProfileFallback />}>
      <ProfileScreen />
    </Suspense>
  )
}
