export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const

export type ImageMediaType = (typeof IMAGE_TYPES)[number]

export type TaskImage = {
  mediaType: ImageMediaType
  raw?: string
  url?: string
  filename?: string
}

const RAW_MAX = 1_500_000

function isImageType(value: unknown): value is ImageMediaType {
  return IMAGE_TYPES.some((type) => type === value)
}

function filenameOf(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim().replace(/\\/g, "/").split("/").pop()?.trim() ?? ""
  if (!trimmed) return undefined
  return [...trimmed].slice(0, 80).join("")
}

function matches(media: ImageMediaType, bytes: Buffer) {
  if (media === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (media === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (media === "image/gif") return bytes.subarray(0, 6).toString() === "GIF87a" || bytes.subarray(0, 6).toString() === "GIF89a"
  return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
}

export function readImage(value: unknown): { image: TaskImage } | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "图片格式不对" }
  const record = value as Record<string, unknown>
  const media = record.mediaType ?? record.media_type
  if (!isImageType(media)) return { error: "图片只接受 png、jpeg、webp、gif" }
  const filename = filenameOf(record.filename)
  const rawValue = typeof record.raw === "string" ? record.raw.replace(/\s/g, "") : ""
  if (rawValue) {
    if (rawValue.length > RAW_MAX) return { error: "图片太大" }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(rawValue)) return { error: "图片内容要是 base64" }
    const bytes = Buffer.from(rawValue, "base64")
    if (bytes.length < 12 || !matches(media, bytes)) return { error: "图片内容和类型对不上" }
    return { image: { mediaType: media, raw: rawValue, ...(filename ? { filename } : {}) } }
  }
  const urlValue = typeof record.url === "string" ? record.url.trim() : ""
  if (urlValue.startsWith("data:")) {
    const matched = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(urlValue)
    if (!matched || matched[1] !== media) return { error: "图片内容和类型对不上" }
    return readImage({ mediaType: media, raw: matched[2], filename })
  }
  if (/^https?:\/\//.test(urlValue) && urlValue.length <= 2000) {
    return { image: { mediaType: media, url: urlValue, ...(filename ? { filename } : {}) } }
  }
  return { error: "图片要带 base64 或 http 地址" }
}
