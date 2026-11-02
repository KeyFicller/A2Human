import type { Metadata } from "next"
import { Shell } from "@/components/shell"
import en from "@/locales/en.json"
import zh from "@/locales/zh.json"
import "./globals.css"

export const metadata: Metadata = {
  title: "A2Human",
  description: `${zh.meta.description}${en.meta.description}`,
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
