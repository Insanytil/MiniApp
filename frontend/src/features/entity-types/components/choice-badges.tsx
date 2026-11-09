import { Badge } from '@/components/ui/badge'
import type { ChoiceOption } from '../configuration'

const legacyColors = new Map([
  ['blue', '#2563eb'],
  ['green', '#16a34a'],
  ['amber', '#d97706'],
  ['red', '#dc2626'],
  ['purple', '#9333ea'],
  ['pink', '#db2777'],
])

export function choiceColorHex(color: ChoiceOption['color']) {
  if (!color) return undefined
  return /^#[0-9a-f]{6}$/i.test(color) ? color : legacyColors.get(color)
}

function badgeStyle(option: ChoiceOption) {
  const backgroundColor = choiceColorHex(option.color)
  if (!backgroundColor) return undefined
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel =
      parseInt(backgroundColor.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return { backgroundColor, color: luminance > 0.179 ? '#000' : '#fff' }
}

export function ChoiceBadges({ options }: { options: ChoiceOption[] }) {
  if (!options.length) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex max-w-sm flex-wrap gap-1">
      {options.map((option) => (
        <Badge key={option.id} variant="outline" style={badgeStyle(option)}>
          {option.name}
        </Badge>
      ))}
    </span>
  )
}
