import { AVATAR_MAX_BYTES, avatarContentType, validateAvatarFile, type AvatarContentType } from './avatar'

const OUTPUT_SIDE = 512

export async function prepareAvatarUpload(file: File): Promise<{ body: Blob; contentType: AvatarContentType }> {
  const contentType = avatarContentType(file.type)
  if (!contentType || validateAvatarFile(file)) {
    throw new Error('invalid')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    if (side <= 0) throw new Error('invalid')
    const sx = Math.floor((bitmap.width - side) / 2)
    const sy = Math.floor((bitmap.height - side) / 2)
    const out = Math.min(OUTPUT_SIDE, side)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const context = canvas.getContext('2d')
    if (!context) throw new Error('invalid')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)
    const body = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), contentType, 0.92)
    })
    if (!body || body.size <= 0 || body.size > AVATAR_MAX_BYTES) throw new Error('invalid')
    return { body, contentType }
  } finally {
    bitmap.close()
  }
}
