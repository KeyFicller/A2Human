import type { Metadata } from "next"
import { Shell } from "@/components/shell"
import "./globals.css"

export const metadata: Metadata = {
  title: "A2Human",
  description: "人发布自己的 agent card。模型按技能发现在岗的人，并把任务派过来。",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="flex min-h-full flex-col antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
