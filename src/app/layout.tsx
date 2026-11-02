import type { Metadata } from "next"
import { Shell } from "@/components/shell"
import "./globals.css"

export const metadata: Metadata = {
  title: "有人",
  description: "模型要人的时候，这里有人。有空就挂上岗，按技能把活立刻派过来。",
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
