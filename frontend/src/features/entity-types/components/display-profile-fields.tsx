import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { fieldsOf } from '../configuration'
import type { ConfiguredEntityType } from '../configuration'
import type { DefinitionDraft, DraftUpdate } from '../definition-draft'
import { FieldSelection } from './profile-field-selection'

export function DisplayProfileFields({
  id,
  draft,
  update,
  type,
}: {
  id: string
  draft: DefinitionDraft
  update: DraftUpdate
  type: ConfiguredEntityType
}) {
  const fields = fieldsOf(type)
  const textFields = fields.filter((field) => field.kind !== 'image')
  const imageFields = fields.filter((field) => field.kind === 'image')

  return (
    <>
      <FieldSelection
        label="Champs du titre, dans cet ordre"
        fields={textFields}
        selected={draft.title_fields}
        onChange={(title_fields) => update({ title_fields })}
      />
      <div className="space-y-2">
        <Label htmlFor={`${id}-separator`}>Séparateur</Label>
        <Input
          id={`${id}-separator`}
          maxLength={10}
          value={draft.separator}
          onChange={(event) => update({ separator: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Un espace par défaut : Prénom Nom.
        </p>
      </div>
      <FieldSelection
        label="Champs du sous-titre"
        fields={textFields}
        selected={draft.secondary_fields}
        onChange={(secondary_fields) => update({ secondary_fields })}
      />
      <div className="space-y-2">
        <Label htmlFor={`${id}-image`}>Image / avatar</Label>
        <NativeSelect
          id={`${id}-image`}
          value={draft.image_field ?? ''}
          onChange={(event) =>
            update({ image_field: event.target.value || null })
          }
        >
          <NativeSelectOption value="">
            Aucune — utiliser les initiales
          </NativeSelectOption>
          {imageFields.map((field) => (
            <NativeSelectOption key={field.id} value={field.id}>
              {field.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </>
  )
}
