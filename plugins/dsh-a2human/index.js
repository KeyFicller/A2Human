import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { delegateTask, describeDuty, directoryUrl, readRoster, rosterKey, summarizeRoster, uniqueToolNames } from "./roster.js"

export const name = "dsh-a2human"

const REFRESH_MS = 20000

function profileFrom(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === "--profile" && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1]
    if (token.startsWith("--profile=")) return token.slice("--profile=".length)
  }
  if (!argv.includes("--profile") && !argv.some((token) => token.startsWith("--profile=")) && argv[2] === "web") return "web"
  return "web"
}

export function configFilePath(env = process.env, argv = process.argv, homeDir = homedir()) {
  const home = env.DSH_HOME || join(homeDir, ".dsh")
  const profile = profileFrom(argv) || "web"
  if (profile.includes("/") || profile.includes("\\") || profile === "." || profile === "..") {
    return join(home, "profiles", "web", "a2human.json")
  }
  return join(home, "profiles", profile, "a2human.json")
}

function readSavedDirectory(file) {
  if (!existsSync(file)) return ""
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"))
    return typeof parsed?.directory === "string" ? parsed.directory : ""
  } catch {
    return ""
  }
}

function writeSavedDirectory(file, directory) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ directory }, null, 2)}\n`, "utf8")
  renameSync(tmp, file)
}

function disposeAll(disposers) {
  for (const dispose of disposers) {
    try {
      if (typeof dispose === "function") dispose()
      else if (dispose && typeof dispose.dispose === "function") dispose.dispose()
    } catch {
      // A tool that is already gone should not block the next roster.
    }
  }
}

async function fetchCard(url, signal) {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal })
  if (!response.ok) throw new Error(`发现入口返回 ${response.status}`)
  return response.json()
}

function rpcCall(signal) {
  return async (url, body, callSignal) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "A2A-Version": "1.0",
      },
      body: JSON.stringify(body),
      signal: callSignal ?? signal,
    })
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`调用没有返回 JSON（${response.status}）`)
    }
  }
}

function dutyTool(tools, item) {
  return tools.register?.({
    name: item.name,
    description: describeDuty(item.entry),
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "要这个人办的事。JSON 对象或数组会按 application/json 送出。",
        },
      },
      required: ["prompt"],
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: String(value) }],
    },
    async execute(args, exec) {
      return delegateTask({
        url: item.entry.url,
        skill: item.entry.skillName,
        prompt: args?.prompt,
        call: rpcCall(exec?.signal),
        signal: exec?.signal,
      })
    },
  })
}

export function apply(ctx, config = {}) {
  const mount = (bound) => {
    const file = configFilePath()
    let directory = ""
    try {
      directory = directoryUrl(config.directory || process.env.A2HUMAN_DIRECTORY || readSavedDirectory(file))
    } catch {
      directory = ""
    }
    let dutyDisposers = []
    let currentKey = ""
    let tail = Promise.resolve()
    let timer

    const clearDuty = () => {
      disposeAll(dutyDisposers)
      dutyDisposers = []
      currentKey = ""
    }

    const publish = (entries) => {
      const key = rosterKey(entries)
      if (key === currentKey && (key !== "" || dutyDisposers.length === 0)) return summarizeRoster(entries)
      clearDuty()
      for (const item of uniqueToolNames(entries)) {
        const dispose = dutyTool(bound.tools, item)
        if (dispose) dutyDisposers.push(dispose)
      }
      currentKey = key
      return summarizeRoster(entries)
    }

    const refresh = () => {
      const run = tail.then(async () => {
        if (!directory) return ""
        const card = await fetchCard(directory)
        return publish(readRoster(card))
      })
      tail = run.then(
        () => {},
        () => {},
      )
      return run
    }

    const connect = bound.tools.register?.({
      name: "a2human_connect",
      description: "连接 A2Human 的发现入口，把当前所有在岗的人和技能一次性变成可调用的工具。之后名单约每 20 秒刷新。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "发现入口，例如 https://主机/.well-known/agent-card.json",
          },
        },
        required: ["url"],
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: String(value) }],
      },
      async execute(args) {
        const next = directoryUrl(args?.url)
        writeSavedDirectory(file, next)
        directory = next
        clearDuty()
        return refresh()
      },
    })

    timer = setInterval(() => {
      refresh().catch((error) => {
        bound.logger?.warn?.(`[a2human] ${error instanceof Error ? error.message : String(error)}`)
      })
    }, REFRESH_MS)
    if (typeof timer.unref === "function") timer.unref()

    refresh().catch((error) => {
      bound.logger?.warn?.(`[a2human] ${error instanceof Error ? error.message : String(error)}`)
    })

    const stop = () => {
      clearInterval(timer)
      clearDuty()
      disposeAll([connect])
    }
    if (typeof bound.effect === "function") bound.effect(() => stop)
    else bound.on?.("dispose", stop)
  }

  if (typeof ctx.inject === "function") ctx.inject(["tools"], mount)
  else mount(ctx)
}
