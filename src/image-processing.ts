const MAX_EDGE = 1600
const OUTPUT_QUALITY = 0.82

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('invalid_image'))
    image.src = source
  })
}

function canvasToDataUrl(canvas: HTMLCanvasElement, type = 'image/webp', quality = OUTPUT_QUALITY): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('image_encode_failed'))
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('image_read_failed'))
      reader.readAsDataURL(blob)
    }, type, quality)
  })
}

export async function optimizeImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('unsupported_image')
  if (file.size > 6 * 1024 * 1024) throw new Error('image_too_large')

  const source = URL.createObjectURL(file)
  try {
    const image = await loadImage(source)
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('canvas_unavailable')
    context.fillStyle = '#f8f7f2'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    return await canvasToDataUrl(canvas)
  } finally {
    URL.revokeObjectURL(source)
  }
}
