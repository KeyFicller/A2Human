import enUi from "@/locales/en.json"
import zhUi from "@/locales/zh.json"
import enWire from "@/locales/wire.en.json"
import zhWire from "@/locales/wire.zh.json"

export type Locale = "zh" | "en"

type Tree = { [key: string]: string | Tree }

const catalogs: Record<Locale, Tree> = { zh: zhUi as Tree, en: enUi as Tree }

export function fill(template: string, vars: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => (key in vars ? String(vars[key]) : token))
}

function lookup(tree: Tree, path: string) {
  const parts = path.split(".")
  let node: string | Tree = tree
  for (const part of parts) {
    if (typeof node === "string" || !(part in node)) throw new Error(`Missing copy: ${path}`)
    node = node[part]
  }
  if (typeof node !== "string") throw new Error(`Missing copy: ${path}`)
  return node
}

export function phrase(path: string, vars?: Record<string, string | number>, locale: Locale = "zh") {
  return fill(lookup(catalogs[locale], path), vars)
}

export function wire(path: string, vars?: Record<string, string | number>) {
  return fill(lookup(zhWire as Tree, path), vars)
}

type Template = { pattern: RegExp; names: string[]; en: string; literal: number }

function walk(zhNode: unknown, enNode: unknown, exact: Map<string, string>, templates: Template[]) {
  if (typeof zhNode === "string" && typeof enNode === "string") {
    const names = [...zhNode.matchAll(/\{(\w+)\}/g)].map((match) => match[1])
    if (names.length === 0) {
      exact.set(zhNode, enNode)
      return
    }
    let source = "^"
    const parts = zhNode.split(/\{(\w+)\}/)
    parts.forEach((part, index) => {
      if (index % 2 === 0) source += part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      else source += "(.+)"
    })
    const literal = zhNode.replace(/\{\w+\}/g, "").length
    templates.push({ pattern: new RegExp(`${source}$`), names, en: enNode, literal })
    return
  }
  if (!zhNode || !enNode || typeof zhNode !== "object" || typeof enNode !== "object") return
  for (const key of Object.keys(zhNode)) walk((zhNode as Tree)[key], (enNode as Tree)[key], exact, templates)
}

const exactEnglish = new Map<string, string>()
const templates: Template[] = []
walk(zhWire, enWire, exactEnglish, templates)
templates.sort((left, right) => right.literal - left.literal || right.pattern.source.length - left.pattern.source.length)

export function localizeError(message: string, locale: Locale): string {
  if (message.includes("\n")) return message.split("\n").map((line) => localizeError(line, locale)).join("\n")
  if (locale !== "en") return message
  const known = exactEnglish.get(message)
  if (known) return known
  for (const template of templates) {
    const matched = template.pattern.exec(message)
    if (!matched) continue
    const vars: Record<string, string> = {}
    template.names.forEach((name, index) => {
      const raw = matched[index + 1] ?? ""
      vars[name] = exactEnglish.get(raw) ?? raw
    })
    return fill(template.en, vars)
  }
  return message
}
