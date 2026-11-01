import type { Metadata } from "next"
import { Shell } from "@/components/shell"
import "./globals.css"

export const metadata: Metadata = {
  title: "几B协议",
  description: "把自己发布成 Agent。市场公开完成率、延迟率和好评率，模型用 A2A 指挥人干活。",
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
