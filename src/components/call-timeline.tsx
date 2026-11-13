"use client"

import { useLocale } from "@/components/locale-provider"
import { formatWhen } from "@/lib/format"
import { callTimeline, type CallStep } from "@/lib/task-view"
import { localizeError, type Messages } from "@/lib/messages"
import type { ProtocolMessage, Task } from "@/lib/types"

function mediaSrc(file: { mediaType: string; raw?: string; url?: string }) {
  if (file.url) return file.url
  if (file.raw) return `data:${file.mediaType};base64,${file.raw}`
  return ""
}

function headline(step: CallStep, side: "agent" | "web" | "human", t: Messages["task"]) {
  if (step === "request") return side === "web" ? t.stepRequestWeb : t.stepRequest
  if (step === "progress") return t.stepProgress
  if (step === "artifact") return t.stepArtifact
  if (step === "score") return side === "web" ? t.stepScoreWeb : t.stepScore
  if (step === "complete") return t.stepComplete
  if (step === "input") return t.stepInput
  if (step === "reject") return t.stepReject
  if (step === "fail") return t.stepFail
  if (step === "cancel") return t.stepCancel
  return t.stepNote
}

/** The right-hand call log: what the Agent asked, what the human did, and how it ended. */
export function CallTimeline({ task, messages }: { task: Task; messages: ProtocolMessage[] }) {
  const { locale, t } = useLocale()
  const events = callTimeline(task, messages)

  return (
    <section className="sheet p-5 lg:sticky lg:top-24">
      <h2 className="font-serif text-2xl">{t.task.timelineTitle}</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.task.timelineLead}</p>
      {events.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">{t.task.timelineEmpty}</p> : null}
      <ol className="mt-5 space-y-5 border-l border-[#d9d0c0] pl-5">
        {events.map((event) => {
          const human = event.side === "human"
          const ending = event.step === "reject" || event.step === "fail" || event.step === "cancel"
          return (
            <li key={event.id} className="relative">
              <span
                aria-hidden
                className={`absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-[#fbf7ee] ${
                  ending ? "bg-muted-foreground" : human ? "bg-stamp" : event.side === "web" ? "bg-moss" : "bg-ink"
                }`}
              />
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{headline(event.step, event.side, t.task)}</span>
                <span className={`font-mono text-[10px] tracking-[0.14em] ${human ? "text-stamp" : "text-muted-foreground"}`}>
                  {human ? t.task.sideHuman : event.side === "web" ? t.task.sideWeb : t.task.sideAgent}
                </span>
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {event.name} · {formatWhen(event.at, locale)}
              </p>
              {event.step === "score" && typeof task.workScore === "number" ? (
                <p className="mt-1 font-serif text-3xl text-stamp">
                  {task.workScore}
                  <span className="ml-1 text-sm text-muted-foreground">/ 5</span>
                </p>
              ) : null}
              {event.text && !(event.step === "score" && typeof task.workScore === "number") ? (
                <p className={`mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 ${event.step === "request" ? "font-serif text-base" : ""}`}>
                  {localizeError(event.text, locale)}
                </p>
              ) : null}
              {event.media && task.artifactImage ? (
                // Data URLs and caller-supplied addresses are not next/image sources.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaSrc(task.artifactImage)}
                  alt={task.artifactImage.filename || t.task.returnedAlt}
                  className="mt-2 max-h-36 rounded-lg border border-[#d9d0c0] bg-[#fffdf8] object-contain"
                />
              ) : null}
              {event.media && task.artifactAudio ? <audio className="mt-2 w-full" controls src={mediaSrc(task.artifactAudio)} /> : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
