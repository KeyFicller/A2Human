"use client"

import { useEffect, useRef, useState, type PointerEvent } from "react"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
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

export function DrawBoard({ onImage }: { onImage: (image: TaskImage | null) => void }) {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startedAt = useRef<number | null>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
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
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.fillStyle = "#fffdf8"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    prepare(ctx)
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
      const canvas = canvasRef.current
      if (!canvas) return
      const url = canvas.toDataURL("image/png")
      const bytes = Math.ceil(((url.split(",")[1] ?? "").length * 3) / 4)
      const parsed = imageFromDataUrl(url, "drawing.png", bytes)
      onImageRef.current("image" in parsed ? parsed.image : null)
    }, 200)
    return () => window.clearInterval(timer)
  }, [phase])

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function start() {
    if (phase !== "idle") return
    paintBlank()
    startedAt.current = Date.now()
    setPhase("live")
    setLeft(DRAW_LIMIT_MS / 1000)
    exportDrawing()
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        aria-label={t.output.drawLabel}
        className={`w-full touch-none rounded-xl border border-[#d9d0c0] bg-[#fffdf8] ${phase === "live" ? "cursor-crosshair" : ""}`}
        onPointerDown={(event) => {
          if (phase !== "live") return
          const canvas = canvasRef.current
          const ctx = canvas?.getContext("2d")
          const at = point(event)
          if (!canvas || !ctx || !at) return
          prepare(ctx)
          canvas.setPointerCapture(event.pointerId)
          last.current = at
          ctx.beginPath()
          ctx.moveTo(at.x, at.y)
        }}
        onPointerMove={(event) => {
          if (phase !== "live" || !last.current) return
          const ctx = canvasRef.current?.getContext("2d")
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
          <Button type="button" variant="outline" onClick={start}>
            {t.output.drawStart}
          </Button>
          <p className="text-sm text-muted-foreground">{t.output.drawIdle}</p>
        </div>
      ) : null}
      {phase === "live" ? <p className="font-mono text-sm text-stamp">{t.output.drawLeft(left)}</p> : null}
      {phase === "frozen" ? <p className="text-sm text-stamp">{t.output.drawFrozen}</p> : null}
    </div>
  )
}
