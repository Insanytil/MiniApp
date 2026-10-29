import type { DisplayProfile } from './configuration'

export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.startsWith('/')) {
    try {
      const url = new URL(value, 'https://preview.invalid')
      return url.origin === 'https://preview.invalid' && !value.includes('\\')
        ? `${url.pathname}${url.search}${url.hash}`
        : null
    } catch {
      return null
    }
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}
export function recordInitials(title: string): string {
  return (title.match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase()
}

export function presentRecord(
  profile: DisplayProfile | undefined,
  values: Record<string, unknown>,
  fallback: string,
) {
  const compose = (ids: string[]) =>
    ids
      .map((id) => displayValue(values[id]))
      .filter(Boolean)
      .join(profile?.separator ?? ' ')
  const title = profile ? compose(profile.title_fields) || fallback : fallback
  const secondary = profile ? compose(profile.secondary_fields) : ''
  const image = profile?.image_field
    ? safeImageUrl(values[profile.image_field])
    : null
  const initials = recordInitials(title)
  return { title, secondary, image, initials }
}
