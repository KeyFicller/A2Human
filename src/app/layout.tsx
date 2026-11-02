import type { Metadata } from "next"
import { Shell } from "@/components/shell"
import "./globals.css"

export const metadata: Metadata = {
  title: "A2Human",
  description: "赛博打工。有空就上工，模型按技能把活派过来。",
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
