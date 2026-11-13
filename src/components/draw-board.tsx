"use client"

import { useEffect, useRef, useState, type PointerEvent } from "react"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { StageClock } from "@/components/stage-clock"
import { imageFromDataUrl } from "@/lib/field-control"
import { DRAW_LIMIT_MS, drawClock } from "@/lib/publish-skills"
import type { TaskImage } from "@/lib/types"

const WIDTH = 560
const HEIGHT = 320

function prepare(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "#241c14"
  ctx.lineWidth = 3
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
}

function contextOf(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d", { willReadFrequently: true })
}

export function DrawBoard({ onImage }: { onImage: (image: TaskImage | null) => void }) {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startedAt = useRef<number | null>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const history = useRef<ImageData[]>([])
  const onImageRef = useRef(onImage)
  const [phase, setPhase] = useState<"idle" | "live" | "frozen">("idle")
  const [left, setLeft] = useState(DRAW_LIMIT_MS / 1000)

  useEffect(() => {
    onImageRef.current = onImage
  }, [onImage])

  function exportDrawing() {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = canvas.toDataURL("image/png")
    const bytes = Math.ceil(((url.split(",")[1] ?? "").length * 3) / 4)
    const parsed = imageFromDataUrl(url, "drawing.png", bytes)
    onImageRef.current("image" in parsed ? parsed.image : null)
  }

  function paintBlank() {
    const canvas = canvasRef.current
    const ctx = canvas ? contextOf(canvas) : null
    if (!canvas || !ctx) return
    ctx.fillStyle = "#fffdf8"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    prepare(ctx)
  }

  function remember() {
    const canvas = canvasRef.current
    const ctx = canvas ? contextOf(canvas) : null
    if (!canvas || !ctx) return
    history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (history.current.length > 40) history.current.shift()
  }

  useEffect(() => {
    paintBlank()
  }, [])

  useEffect(() => {
    if (phase !== "live") return
    const timer = window.setInterval(() => {
      const clock = drawClock(startedAt.current, Date.now())
      setLeft(Math.ceil(clock.leftMs / 1000))
      if (clock.phase !== "frozen") return
      setPhase("frozen")
      exportDrawing()
    }, 200)
    return () => window.clearInterval(timer)
  }, [phase])

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const style = getComputedStyle(canvas)
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0
    const width = rect.width - borderLeft - borderRight
    const height = rect.height - borderTop - borderBottom
    if (!width || !height) return null
    return {
      x: ((event.clientX - rect.left - borderLeft) / width) * canvas.width,
      y: ((event.clientY - rect.top - borderTop) / height) * canvas.height,
    }
  }

  function start() {
    if (phase !== "idle") return
    paintBlank()
    history.current = []
    startedAt.current = Date.now()
    setPhase("live")
    setLeft(DRAW_LIMIT_MS / 1000)
    exportDrawing()
  }

  function undo() {
    if (phase !== "live") return
    const canvas = canvasRef.current
    const ctx = canvas ? contextOf(canvas) : null
    const prev = history.current.pop()
    if (!canvas || !ctx || !prev) return
    ctx.putImageData(prev, 0, 0)
    exportDrawing()
  }

  function clearBoard() {
    if (phase !== "live") return
    paintBlank()
    history.current = []
    exportDrawing()
  }

  function restart() {
    if (phase === "frozen") return
    startedAt.current = null
    last.current = null
    history.current = []
    paintBlank()
    setPhase("idle")
    setLeft(DRAW_LIMIT_MS / 1000)
    onImageRef.current(null)
  }

  return (
    <div className="space-y-3">
      <StageClock
        label={phase === "live" ? t.output.drawLive : phase === "frozen" ? t.output.timeUp : t.output.drawReady}
        seconds={phase === "frozen" ? 0 : left}
        unit={t.output.secondsUnit}
        state={phase === "live" ? "live" : phase === "frozen" ? "done" : "idle"}
      />
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        aria-label={t.output.drawLabel}
        className={`w-full touch-none rounded-xl border border-[#d9d0c0] bg-[#fffdf8] ${phase === "live" ? "cursor-crosshair" : ""}`}
        onPointerDown={(event) => {
          if (phase !== "live") return
          const canvas = canvasRef.current
          const ctx = canvas ? contextOf(canvas) : null
          const at = point(event)
          if (!canvas || !ctx || !at) return
          remember()
          prepare(ctx)
          canvas.setPointerCapture(event.pointerId)
          last.current = at
          ctx.beginPath()
          ctx.moveTo(at.x, at.y)
          ctx.lineTo(at.x, at.y)
          ctx.stroke()
        }}
        onPointerMove={(event) => {
          if (phase !== "live" || !last.current) return
          const ctx = canvasRef.current ? contextOf(canvasRef.current) : null
          const at = point(event)
          if (!ctx || !at) return
          prepare(ctx)
          ctx.beginPath()
          ctx.moveTo(last.current.x, last.current.y)
          ctx.lineTo(at.x, at.y)
          ctx.stroke()
          last.current = at
        }}
        onPointerUp={() => {
          if (!last.current) return
          last.current = null
          exportDrawing()
        }}
        onPointerCancel={() => {
          last.current = null
        }}
      />
      {phase === "idle" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="lg" className="px-5" onClick={start}>
            {t.output.drawStart}
          </Button>
          <p className="text-sm text-muted-foreground">{t.output.drawIdle}</p>
        </div>
      ) : null}
      {phase === "live" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={undo}>
            {t.output.drawUndo}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearBoard}>
            {t.output.drawClear}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={restart}>
            {t.output.drawRestart}
          </Button>
        </div>
      ) : null}
      {phase === "frozen" ? <p className="text-sm text-stamp">{t.output.drawLocked}</p> : null}
    </div>
  )
}
