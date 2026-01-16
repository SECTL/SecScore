function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ]
    : [0, 0, 0]
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const v = max
  const d = max - min
  s = max === 0 ? 0 : d / max

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }
  return [h * 360, s, v]
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  let r = 0,
    g = 0,
    b = 0
  const i = Math.floor(h / 60)
  const f = h / 60 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0:
      r = v
      g = t
      b = p
      break
    case 1:
      r = q
      g = v
      b = p
      break
    case 2:
      r = p
      g = v
      b = t
      break
    case 3:
      r = p
      g = q
      b = v
      break
    case 4:
      r = t
      g = p
      b = v
      break
    case 5:
      r = v
      g = p
      b = q
      break
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function componentToHex(c: number): string {
  const hex = c.toString(16)
  return hex.length === 1 ? '0' + hex : hex
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b)
}

export function generateColorMap(
  brandColor: string,
  mode: 'light' | 'dark'
): Record<string, string> {
  const [r, g, b] = hexToRgb(brandColor)
  const [h, s, v] = rgbToHsv(r, g, b)

  const colors: Record<string, string> = {}
  const palette: string[] = []

  for (let i = 1; i <= 10; i++) {
    let newS = s
    let newV = v

    if (i === 6) {
      palette.push(brandColor)
      continue
    }

    if (mode === 'light') {
      if (i < 6) {
        newS = s * Math.pow(0.6, (6 - i) / 5)
        newV = v + (1 - v) * ((6 - i) / 5) * 0.9
      } else {
        newS = s + (1 - s) * ((i - 6) / 4) * 0.2
        newV = v * Math.pow(0.85, (i - 6) / 4)
      }
    } else {
      if (i < 6) {
        newS = s * Math.pow(0.8, (6 - i) / 5)
        newV = v * Math.pow(0.9, (6 - i) / 5)
      } else {
        newS = s + (1 - s) * ((i - 6) / 4) * 0.4
        newV = v + (1 - v) * ((i - 6) / 4) * 0.5
      }
    }

    newS = Math.max(0, Math.min(1, newS))
    newV = Math.max(0, Math.min(1, newV))

    const [nr, ng, nb] = hsvToRgb(h, newS, newV)
    palette.push(rgbToHex(nr, ng, nb))
  }

  palette.forEach((color, index) => {
    colors[`--td-brand-color-${index + 1}`] = color
  })

  colors['--td-brand-color'] = brandColor

  colors['--td-brand-color-light'] = palette[0]
  colors['--td-brand-color-focus'] = palette[1]
  colors['--td-brand-color-disabled'] = palette[2]
  colors['--td-brand-color-hover'] = palette[4]
  colors['--td-brand-color-active'] = palette[6]

  return colors
}
