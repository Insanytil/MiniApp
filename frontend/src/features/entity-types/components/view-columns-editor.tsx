import { useState } from 'react'
import { Columns3, Eye, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  ConfiguredEntityType,
  DisplayProfile,
  ViewColumn,
} from '../configuration'
import {
  MAX_VIEW_COLUMNS,
  columnContext,
  columnFromChoice,
} from '../view-column-choices'
import { moveViewColumn, viewColumnKey } from '../view-column-order'
import { AddViewColumnsDialog } from './add-view-columns-dialog'
import { ConfigurationPreview } from './configuration-preview'
import { DefinitionSheet } from './definition-sheet'
import { ViewColumnDisplayDialog } from './view-column-display-dialog'
import { ViewColumnsTable } from './view-columns-table'

interface ProfileEditor {
  target: ConfiguredEntityType
  columnId: string
  profile?: DisplayProfile
}

export function ViewColumnsEditor({
  type,
  catalog,
  columns,
  onChange,
  onSaveRelatedProfile,
  onBusyChange,
  onDirtyChange,
}: {
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  columns: ViewColumn[]
  onChange: (columns: ViewColumn[]) => void
  onSaveRelatedProfile?: (
    target: ConfiguredEntityType,
    profile: DisplayProfile,
  ) => Promise<void>
  onBusyChange: (busy: boolean) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const context = columnContext(type, catalog)
  const [announcement, setAnnouncement] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [profileEditor, setProfileEditor] = useState<ProfileEditor | null>(null)
  const editingIndex = columns.findIndex((column) => column.id === editingId)
  const editing = editingIndex >= 0 ? columns[editingIndex] : undefined
  const keys = new Set(columns.map(viewColumnKey))
  const duplicates = keys.size !== columns.length
  const remaining = Math.max(0, MAX_VIEW_COLUMNS - columns.length)

  const update = (index: number, patch: Partial<ViewColumn>) =>
    onChange(
      columns.map((column, i) =>
        i === index ? { ...column, ...patch } : column,
      ),
    )
  const reorder = (sourceId: string, targetId: string) => {
    const next = moveViewColumn(columns, sourceId, targetId)
    if (next === columns) return
    onChange(next)
    setAnnouncement(
      `Colonne déplacée en position ${next.findIndex((column) => column.id === sourceId) + 1} sur ${next.length}.`,
    )
  }
  const move = (column: ViewColumn, offset: number) => {
    const index = columns.indexOf(column) + offset
    const target = index >= 0 ? columns.at(index) : undefined
    if (target) reorder(column.id, target.id)
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-medium">
              <Columns3 className="size-4" />
              Colonnes du tableau{' '}
              <Badge variant="secondary">
                {columns.length}/{MAX_VIEW_COLUMNS}
              </Badge>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Déplacez les colonnes par leur poignée. Les champs s’affichent
              directement ; utilisez le crayon pour les affichages particuliers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!columns.length}
              onClick={() => setPreviewOpen(true)}
            >
              <Eye />
              Prévisualiser
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!remaining}
              onClick={() => setAddOpen(true)}
            >
              <Plus />
              Ajouter des colonnes
            </Button>
          </div>
        </div>
        {duplicates && (
          <p role="alert" className="text-sm text-destructive">
            Certaines colonnes sont présentes plusieurs fois. Retirez les
            doublons avant d’appliquer la vue.
          </p>
        )}
        <ViewColumnsTable
          context={context}
          columns={columns}
          onReorder={reorder}
          onMove={move}
          onUpdate={update}
          onEdit={setEditingId}
          onRemove={(columnId) =>
            onChange(columns.filter((entry) => entry.id !== columnId))
          }
        />
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>
      {addOpen && (
        <AddViewColumnsDialog
          choices={context.choices}
          presentKeys={keys}
          remaining={remaining}
          onAdd={(added) =>
            onChange([...columns, ...added.map(columnFromChoice)])
          }
          onClose={() => setAddOpen(false)}
        />
      )}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85dvh] min-w-0 overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Prévisualisation de la vue</DialogTitle>
            <DialogDescription>
              L’ordre et l’affichage des colonnes sont ceux de votre brouillon.
            </DialogDescription>
          </DialogHeader>
          <ConfigurationPreview
            type={{
              ...type,
              configuration: {
                ...type.configuration,
                views: columns.length
                  ? [
                      {
                        id: 'draft-preview',
                        name: 'Vue en cours',
                        columns,
                        is_default: true,
                      },
                    ]
                  : [],
              },
            }}
            catalog={catalog}
            compact
          />
        </DialogContent>
      </Dialog>
      {editing && (
        <ViewColumnDisplayDialog
          key={editing.id}
          context={context}
          column={editing}
          canEditProfiles={!!onSaveRelatedProfile}
          onUpdate={(patch) => update(editingIndex, patch)}
          onEditProfile={(target, profile) =>
            setProfileEditor({ target, columnId: editing.id, profile })
          }
          onClose={() => setEditingId(null)}
        />
      )}
      {profileEditor && onSaveRelatedProfile && (
        <DefinitionSheet
          key={`${profileEditor.target.id}/${profileEditor.profile?.id ?? 'new'}`}
          kind="display_profiles"
          item={profileEditor.profile}
          type={profileEditor.target}
          catalog={catalog}
          description={
            profileEditor.target.id === type.id
              ? `${type.name} · Le profil sera ajouté au brouillon avec cette vue.`
              : `${profileEditor.target.name} · Ce profil sera enregistré sur ce type et réutilisable dans ses vues. La vue actuelle reste en brouillon. Modifier un profil existant affecte toutes les vues qui l’utilisent.`
          }
          saveLabel={
            profileEditor.target.id === type.id
              ? 'Appliquer au brouillon'
              : 'Enregistrer le profil'
          }
          onBusyChange={onBusyChange}
          onDirtyChange={onDirtyChange}
          onClose={() => setProfileEditor(null)}
          onSave={async (item) => {
            await onSaveRelatedProfile(
              profileEditor.target,
              item as DisplayProfile,
            )
            onChange(
              columns.map((column) =>
                column.id === profileEditor.columnId
                  ? {
                      ...column,
                      profile_id: profileEditor.profile
                        ? column.profile_id
                        : item.id,
                    }
                  : column,
              ),
            )
          }}
        />
      )}
    </>
  )
}
