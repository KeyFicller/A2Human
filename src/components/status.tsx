import { Button } from "@/components/ui/button"

export function LoadingLine({ text = "正在读取协议状态…" }: { text?: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
}

export function ErrorNote({
  text,
  onRetry,
}: {
  text: string
  onRetry?: () => void
}) {
  return (
    <div className="sheet px-4 py-3 text-sm">
      <p>{text}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyNote({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="sheet px-5 py-8">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}
