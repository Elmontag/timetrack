import type { TimeDisplayFormat } from '../api'

interface FormatOptions {
  includeUnit?: boolean
  unitLabel?: string
  decimalPlaces?: number
}

export function formatSeconds(
  seconds: number | null | undefined,
  format: TimeDisplayFormat,
  options: FormatOptions = {},
): string {
  const value = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : 0
  const unit = options.unitLabel ?? 'h'
  if (format === 'decimal') {
    const decimals = typeof options.decimalPlaces === 'number' ? options.decimalPlaces : 2
    const hours = value / 3600
    let text = hours.toFixed(decimals)
    if (text.startsWith('-0')) {
      const normalized = Number(text)
      if (Object.is(normalized, -0) || Math.abs(normalized) < 1 / Math.pow(10, decimals)) {
        text = `0${decimals > 0 ? '.' + '0'.repeat(decimals) : ''}`
      }
    }
    if (decimals === 0) {
      text = `${Math.round(hours)}`
    }
    const localized = text.replace('.', ',')
    return options.includeUnit ? `${localized} ${unit}` : localized
  }

  const absolute = Math.abs(Math.trunc(value))
  const sign = value < 0 ? '-' : ''
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor((absolute % 3600) / 60)
  const formatted = `${sign}${hours}:${minutes.toString().padStart(2, '0')}`
  return options.includeUnit ? `${formatted} ${unit}` : formatted
}
