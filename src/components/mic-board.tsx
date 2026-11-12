"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { AUDIO_ACCEPT, AUDIO_MAX_BYTES, audioFromDataUrl } from "@/lib/field-control"
import { MIC_LIMIT_MS, timedClock } from "@/lib/publish-skills"
import type { TaskAudio } from "@/lib/types"

export function MicBoard({
  limitMs,
  onAudio,
}: {
  limitMs?: number
  onAudio: (audio: TaskAudio | null) => void
}) {
  const { t } = useLocale()
  const timed = typeof limitMs === "number"
  const fileRef = useRef<HTMLInputElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef<number | null>(null)
  const onAudioRef = useRef(onAudio)
  const [phase, setPhase] = useState<"idle" | "live" | "done">("idle")
  const [left, setLeft] = useState((limitMs ?? MIC_LIMIT_MS) / 1000)
  const [clip, setClip] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    onAudioRef.current = onAudio
  }, [onAudio])

  useEffect(() => {
    return () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  function takeParsed(result: string, filename: string, size: number) {
    const parsed = audioFromDataUrl(result, filename, size)
    if ("error" in parsed) {
      setError(parsed.error === "tooBig" ? t.task.audioTooBig : t.task.audioType)
      onAudioRef.current(null)
      setClip(null)
      return
    }
    setError("")
    setClip(result)
    onAudioRef.current(parsed.audio)
  }

  function finish(blob: Blob) {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      takeParsed(result, "take.webm", blob.size)
      setPhase("done")
    }
    reader.readAsDataURL(blob)
  }

  function stop() {
    const active = recorder.current
    if (active && active.state !== "inactive") active.stop()
    else setPhase("done")
  }

  async function start() {
    if (phase === "live") return
    setError("")
    setClip(null)
    onAudioRef.current(null)
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(t.task.audioType)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : ""
      const next = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunks.current = []
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data)
      }
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks.current, { type: next.mimeType || "audio/webm" })
        finish(blob)
      }
      recorder.current = next
      startedAt.current = Date.now()
      setPhase("live")
      setLeft(Math.ceil((limitMs ?? MIC_LIMIT_MS) / 1000))
      next.start()
    } catch {
      setError(t.task.audioType)
    }
  }

  useEffect(() => {
    if (phase !== "live" || !timed) return
    const timer = window.setInterval(() => {
      const clock = timedClock(startedAt.current, Date.now(), limitMs ?? MIC_LIMIT_MS)
      setLeft(Math.ceil(clock.leftMs / 1000))
      if (clock.phase === "frozen") stop()
    }, 200)
    return () => window.clearInterval(timer)
  }, [phase, timed])

  function restart() {
    recorder.current?.stream.getTracks().forEach((track) => track.stop())
    recorder.current = null
    startedAt.current = null
    setClip(null)
    setPhase("idle")
    setLeft(Math.ceil((limitMs ?? MIC_LIMIT_MS) / 1000))
    onAudioRef.current(null)
  }

  return (
    <div className="space-y-2">
      {phase === "live" && timed ? (
        <p className="sticky top-28 z-10 rounded-lg bg-[#fbf7ee]/95 px-2 py-1 font-mono text-sm text-stamp">{t.output.micLeft(left)}</p>
      ) : null}
      {phase === "idle" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => void start()}>
            {t.output.micStart}
          </Button>
          <p className="text-sm text-muted-foreground">{timed ? t.output.micIdle : t.output.micUpload}</p>
        </div>
      ) : null}
      {phase === "live" ? (
        <Button type="button" variant="outline" onClick={stop}>
          {t.output.micStop}
        </Button>
      ) : null}
      {clip ? <audio className="w-full" controls src={clip} aria-label={t.output.micLabel} /> : null}
      {phase === "done" ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="text-sm text-action" onClick={restart}>
            {t.output.drawRestart}
          </button>
          <p className="text-sm text-stamp">{timed ? t.output.micDone : null}</p>
        </div>
      ) : null}
      <label className="block text-sm text-muted-foreground">
        {t.output.micUpload}
        <input
          ref={fileRef}
          className="mt-1 block w-full text-sm"
          type="file"
          accept={AUDIO_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            if (file.size > AUDIO_MAX_BYTES) {
              setError(t.task.audioTooBig)
              onAudioRef.current(null)
              return
            }
            const reader = new FileReader()
            reader.onload = () => {
              const result = typeof reader.result === "string" ? reader.result : ""
              takeParsed(result, file.name, file.size)
              setPhase("done")
            }
            reader.readAsDataURL(file)
          }}
        />
      </label>
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
    </div>
  )
}
