import type { Metadata } from "next"
import { PagesGate } from "@/components/pages-gate"
import { Shell } from "@/components/shell"
import { PAGES_BOOT } from "@/lib/pages-boot"
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
        {process.env.NEXT_PUBLIC_PAGES === "1" ? <script dangerouslySetInnerHTML={{ __html: PAGES_BOOT }} /> : null}
        <Shell>
          <PagesGate>{children}</PagesGate>
        </Shell>
      </body>
    </html>
  )
}
