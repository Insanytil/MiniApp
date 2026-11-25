import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DefinitionDraft, DraftUpdate } from '../definition-draft'
import { ChoiceBadges, choiceColorHex } from './choice-badges'
import { LabeledCheckbox } from './profile-field-selection'

type ChoiceOption = DefinitionDraft['options'][number]

const DEFAULT_COLOR = '#2563eb'
const MAX_OPTIONS = 100

export function ChoiceOptionsEditor({
  draft,
  update,
}: {
  draft: DefinitionDraft
  update: DraftUpdate
}) {
  const patchOption = (optionId: string, patch: Partial<ChoiceOption>) =>
    update({
      options: draft.options.map((entry) =>
        entry.id === optionId ? { ...entry, ...patch } : entry,
      ),
    })
  const named = draft.options.filter((option) => option.name.trim())

  return (
    <div className="space-y-2">
      <LabeledCheckbox
        checked={draft.multiple}
        onChange={(multiple) => update({ multiple })}
      >
        Autoriser plusieurs choix
      </LabeledCheckbox>
      {draft.options.map((option, index) => (
        <div className="flex flex-wrap items-center gap-2" key={option.id}>
          <Input
            aria-label={`Option ${index + 1}`}
            className="min-w-32 flex-1"
            placeholder={`Option ${index + 1}`}
            maxLength={255}
            value={option.name}
            onChange={(event) =>
              patchOption(option.id, { name: event.target.value })
            }
          />
          <LabeledCheckbox
            checked={!!option.color}
            onChange={(enabled) =>
              patchOption(option.id, { color: enabled ? DEFAULT_COLOR : null })
            }
          >
            Couleur
          </LabeledCheckbox>
          {option.color && (
            <Input
              type="color"
              className="w-12 cursor-pointer p-1"
              aria-label={`Couleur de l’option ${index + 1}`}
              value={choiceColorHex(option.color) ?? DEFAULT_COLOR}
              onChange={(event) =>
                patchOption(option.id, { color: event.target.value })
              }
            />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              update({
                options: draft.options.filter(
                  (entry) => entry.id !== option.id,
                ),
              })
            }
          >
            Retirer
          </Button>
        </div>
      ))}
      {named.length > 0 && <ChoiceBadges options={named} />}
      <Button
        type="button"
        variant="outline"
        disabled={draft.options.length >= MAX_OPTIONS}
        onClick={() =>
          update({
            options: [...draft.options, { id: crypto.randomUUID(), name: '' }],
          })
        }
      >
        Ajouter une option
      </Button>
    </div>
  )
}
