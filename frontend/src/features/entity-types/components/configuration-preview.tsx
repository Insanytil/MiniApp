import { formatValue } from '@/features/entity-records/records'
import { RecordImage } from '@/features/entity-records/components/record-cell'
import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fieldsOf, navigations } from '../configuration'
import type { ConfiguredEntityType, DisplayProfile } from '../configuration'
import { presentRecord, safeImageUrl } from '../presentation'

export function ConfigurationPreview({
  type,
  catalog,
  compact = false,
}: {
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  compact?: boolean
}) {
  const id = useId()
  const [sampleTypeId, setSampleTypeId] = useState(type.id)
  const [values, setValues] = useState<
    Partial<Record<string, Partial<Record<string, string>>>>
  >({})
  const [viewId, setViewId] = useState('')
  const [profileId, setProfileId] = useState('')
  const sampleType = catalog.find((item) => item.id === sampleTypeId) ?? type
  const sample = (item: ConfiguredEntityType) =>
    Object.fromEntries(
      fieldsOf(item).map((field) => [
        field.id,
        values[item.id]?.[field.id] ??
          (field.kind === 'image'
            ? ''
            : field.kind === 'decimal'
              ? '1250.00'
              : field.kind === 'integer'
                ? '2'
                : field.kind === 'boolean'
                  ? 'true'
                  : field.kind === 'date'
                    ? '2026-10-28'
                    : field.kind === 'datetime'
                      ? '2026-10-28T10:30:00'
                      : field.name),
      ]),
    )
  const profile =
    type.configuration.display_profiles.find((item) => item.id === profileId) ??
    type.configuration.display_profiles.find((item) => item.is_default)
  const view =
    type.configuration.views.find((item) => item.id === viewId) ??
    type.configuration.views.find((item) => item.is_default)
  const paths = navigations(type.id, catalog)
  return (
    <div className="min-w-0 space-y-6">
      <p className="text-sm text-muted-foreground">
        Aperçu avec des données fictives. Ces valeurs restent dans votre
        navigateur et ne créent aucun enregistrement.
      </p>
      <div
        className={
          compact
            ? 'min-w-0'
            : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'
        }
      >
        {!compact && (
          <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
            <h3 className="font-medium">Données d’aperçu</h3>
            <div className="space-y-2">
              <Label htmlFor={`${id}-sample-type`}>Type à renseigner</Label>
              <NativeSelect
                id={`${id}-sample-type`}
                className="w-full"
                value={sampleType.id}
                onChange={(event) => setSampleTypeId(event.target.value)}
              >
                {catalog.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {sampleType.configuration.fields.map((field) => (
                <div key={field.id} className="space-y-1">
                  <Label htmlFor={`${id}-${field.id}`}>
                    {field.name}
                    {field.kind === 'image' ? ' (URL image)' : ''}
                  </Label>
                  <Input
                    id={`${id}-${field.id}`}
                    value={values[sampleType.id]?.[field.id] ?? ''}
                    placeholder={
                      field.kind === 'image' ? 'https://…' : field.name
                    }
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [sampleType.id]: {
                          ...previous[sampleType.id],
                          [field.id]: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))}
              {!sampleType.configuration.fields.length && (
                <p className="text-xs text-muted-foreground">
                  Ajoutez des champs pour personnaliser cet aperçu.
                </p>
              )}
            </div>
          </section>
        )}
        <div className="min-w-0 space-y-6">
          {!compact && (
            <section className="space-y-3 rounded-xl border bg-card p-4">
              <h3 className="font-medium">
                Représentation d’un enregistrement
              </h3>
              {type.configuration.display_profiles.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor={`${id}-profile`}>Affichage</Label>
                  <NativeSelect
                    id={`${id}-profile`}
                    value={profile?.id ?? ''}
                    onChange={(event) => setProfileId(event.target.value)}
                  >
                    {type.configuration.display_profiles.map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
              <RecordPresentation
                profile={profile}
                values={sample(type)}
                fallback={type.name}
              />
            </section>
          )}
          <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
            <h3 className="font-medium">Vue en tableau</h3>
            {view ? (
              <>
                {!compact && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-view`}>Vue</Label>
                    <NativeSelect
                      id={`${id}-view`}
                      value={view.id}
                      onChange={(event) => setViewId(event.target.value)}
                    >
                      {type.configuration.views.map((item) => (
                        <NativeSelectOption key={item.id} value={item.id}>
                          {item.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                )}
                <Table
                  aria-label="Aperçu de la vue"
                  containerProps={{
                    tabIndex: 0,
                    role: 'region',
                    'aria-label': 'Aperçu de la vue',
                  }}
                >
                  <TableHeader>
                    <TableRow>
                      {view.columns.map((column) => (
                        <TableHead key={column.id}>{column.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      {view.columns.map((column) => {
                        if (column.kind === 'display')
                          return (
                            <TableCell key={column.id}>
                              <RecordPresentation
                                profile={
                                  type.configuration.display_profiles.find(
                                    (item) => item.id === column.profile_id,
                                  ) ??
                                  type.configuration.display_profiles.find(
                                    (item) => item.is_default,
                                  )
                                }
                                values={sample(type)}
                                fallback={type.name}
                              />
                            </TableCell>
                          )
                        if (column.kind === 'field') {
                          const field = fieldsOf(type).find(
                            (item) => item.id === column.field_id,
                          )
                          const value = field
                            ? sample(type)[field.id]
                            : 'Champ indisponible'
                          const image =
                            field?.kind === 'image' ? safeImageUrl(value) : null
                          return (
                            <TableCell key={column.id}>
                              {image ? (
                                <RecordImage url={image} />
                              ) : field?.kind === 'image' ? (
                                '—'
                              ) : (
                                <span
                                  className={
                                    field?.kind === 'decimal' ||
                                    field?.kind === 'integer'
                                      ? 'block text-right tabular-nums'
                                      : undefined
                                  }
                                >
                                  {formatValue(value, field?.kind)}
                                </span>
                              )}
                            </TableCell>
                          )
                        }
                        const path = paths.find(
                          (item) =>
                            item.id === column.relation_id &&
                            item.direction === column.direction,
                        )
                        const targets = (path?.type_ids ?? [])
                          .map((typeId) =>
                            catalog.find((item) => item.id === typeId),
                          )
                          .filter(
                            (item): item is ConfiguredEntityType => !!item,
                          )
                        // One fictional record per allowed target; single-valued relations pick one.
                        const linked = path?.many
                          ? targets
                          : targets.slice(0, 1)
                        if (column.kind === 'count')
                          return (
                            <TableCell key={column.id}>
                              {linked.length}
                            </TableCell>
                          )
                        const visible = linked.slice(
                          0,
                          column.collection_display === 'first' ? 1 : 3,
                        )
                        return (
                          <TableCell key={column.id}>
                            <div className="space-y-2">
                              {visible.map((target) => (
                                <RecordPresentation
                                  key={target.id}
                                  profile={
                                    target.configuration.display_profiles.find(
                                      (item) => item.id === column.profile_id,
                                    ) ??
                                    target.configuration.display_profiles.find(
                                      (item) => item.is_default,
                                    )
                                  }
                                  values={sample(target)}
                                  fallback={target.name}
                                />
                              ))}
                              {linked.length > visible.length && (
                                <span className="text-xs text-muted-foreground">
                                  +{linked.length - visible.length}
                                </span>
                              )}
                              {!linked.length && 'Relation indisponible'}
                            </div>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ajoutez une vue pour prévisualiser ses colonnes.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
function RecordPresentation({
  profile,
  values,
  fallback,
}: {
  profile?: DisplayProfile
  values: Record<string, unknown>
  fallback: string
}) {
  const presentation = presentRecord(profile, values, fallback)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium">
        {presentation.image && presentation.image !== failedImage ? (
          <img
            src={presentation.image}
            alt=""
            className="size-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setFailedImage(presentation.image)}
          />
        ) : (
          presentation.initials
        )}
      </div>
      <div className="min-w-0">
        <p className="max-w-64 truncate font-medium" title={presentation.title}>
          {presentation.title}
        </p>
        {presentation.secondary && (
          <p
            className="max-w-64 truncate text-xs text-muted-foreground"
            title={presentation.secondary}
          >
            {presentation.secondary}
          </p>
        )}
      </div>
    </div>
  )
}
