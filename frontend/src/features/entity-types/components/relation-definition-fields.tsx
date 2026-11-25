import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { ConfiguredEntityType, RelationDefinition } from '../configuration'
import type { DefinitionDraft, DraftUpdate } from '../definition-draft'

export function RelationDefinitionFields({
  id,
  draft,
  update,
  type,
  catalog,
  existingRelation,
}: {
  id: string
  draft: DefinitionDraft
  update: DraftUpdate
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  existingRelation?: RelationDefinition
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-source-entity`}>Entité de départ</Label>
          <Input
            id={`${id}-source-entity`}
            value={type.name}
            readOnly
            className="bg-muted/40"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-linked-entity`}>Entité liée</Label>
          {existingRelation ? (
            <Input
              id={`${id}-linked-entity`}
              value={existingRelation.target_type_ids
                .map(
                  (targetId) =>
                    catalog.find((target) => target.id === targetId)?.name ??
                    'Entité indisponible',
                )
                .join(', ')}
              readOnly
              className="bg-muted/40"
            />
          ) : (
            <NativeSelect
              id={`${id}-linked-entity`}
              className="w-full"
              value={draft.target_type_ids[0] ?? ''}
              onChange={(event) =>
                update({
                  target_type_ids: event.target.value
                    ? [event.target.value]
                    : [],
                })
              }
            >
              <NativeSelectOption value="">
                Choisir une entité
              </NativeSelectOption>
              {catalog.map((target) => (
                <NativeSelectOption key={target.id} value={target.id}>
                  {target.name}
                  {target.id === type.id ? ' (même entité)' : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {existingRelation
          ? 'Les entités reliées sont fixées à la création. Pour relier d’autres entités, créez une nouvelle relation.'
          : 'Les deux entités ne pourront plus être changées après la création de la relation.'}
      </p>
      <div className="space-y-2">
        <Label htmlFor={`${id}-inverse`}>Libellé de la relation inverse</Label>
        <Input
          id={`${id}-inverse`}
          maxLength={255}
          value={draft.inverse_name}
          onChange={(event) => update({ inverse_name: event.target.value })}
          placeholder="Exemple : Véhicules affectés"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-cardinality`}>
          Cardinalité depuis {type.name}
        </Label>
        <NativeSelect
          id={`${id}-cardinality`}
          className="w-full"
          value={`${draft.source_max ?? 'n'}:${draft.target_max ?? 'n'}`}
          onChange={(event) => {
            const [source, target] = event.target.value.split(':')
            update({
              source_max: source === '1' ? 1 : null,
              target_max: target === '1' ? 1 : null,
            })
          }}
        >
          <NativeSelectOption value="1:n">
            Plusieurs vers un — une cible par enregistrement
          </NativeSelectOption>
          <NativeSelectOption value="n:1">
            Un vers plusieurs — plusieurs cibles exclusives
          </NativeSelectOption>
          <NativeSelectOption value="1:1">
            Un vers un — une cible exclusive
          </NativeSelectOption>
          <NativeSelectOption value="n:n">
            Plusieurs vers plusieurs
          </NativeSelectOption>
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          Véhicule → Personne : plusieurs vers un. Le sens inverse est créé
          automatiquement.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-delete`}>
          Si un enregistrement lié est supprimé
        </Label>
        <NativeSelect
          id={`${id}-delete`}
          value={draft.on_delete}
          onChange={(event) =>
            update({
              on_delete: event.target.value as DefinitionDraft['on_delete'],
            })
          }
        >
          <NativeSelectOption value="restrict">
            Empêcher la suppression
          </NativeSelectOption>
          <NativeSelectOption value="unlink" disabled={draft.required}>
            Détacher le lien
          </NativeSelectOption>
        </NativeSelect>
      </div>
    </>
  )
}
