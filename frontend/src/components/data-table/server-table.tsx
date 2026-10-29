import { useId, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
} from '@tanstack/react-table'
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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

export const serverTableFeatures = tableFeatures({ rowPaginationFeature })
export type ServerColumn<T extends { id: string }> = ColumnDef<
  typeof serverTableFeatures,
  T
>

interface Props<T extends { id: string }> {
  label: string
  rows: T[]
  columns: ServerColumn<T>[]
  renderActions: (row: T) => ReactNode
  columnClasses?: Record<string, string>
  total: number
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
  search: string
  onSearchChange: (search: string) => void
  busy: boolean
  loading: boolean
  failed: boolean
  searchMaxLength?: number
}

export function ServerTable<T extends { id: string }>({
  label,
  rows,
  columns,
  renderActions,
  columnClasses = {},
  total,
  pagination,
  onPaginationChange,
  search,
  onSearchChange,
  busy,
  loading,
  failed,
  searchMaxLength = 255,
}: Props<T>) {
  const allColumns = useMemo<ServerColumn<T>[]>(
    () => [
      ...columns,
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => renderActions(row.original),
      },
    ],
    [columns, renderActions],
  )
  const table = useTable({
    features: serverTableFeatures,
    columns: allColumns,
    data: rows,
    getRowId: (row) => row.id,
    manualPagination: true,
    rowCount: total,
    state: { pagination },
    onPaginationChange,
  })
  const tableId = useId()
  const searchId = `${tableId}-search`
  const pageSizeId = `${tableId}-page-size`
  const pageCount = Math.max(1, table.getPageCount())
  const from = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const to = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize)

  function columnClass(id: string) {
    return id === 'actions'
      ? 'sticky right-0 z-10 w-20 bg-background text-right shadow-[-1px_0_0_var(--border)]'
      : (columnClasses[id] ?? '')
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Label className="sr-only" htmlFor={searchId}>
            Rechercher dans {label}
          </Label>
          <Search
            className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={searchId}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            maxLength={searchMaxLength}
            placeholder="Rechercher…"
            className="h-10 bg-background pr-10 pl-9"
          />
          {busy ? (
            <LoaderCircle
              className="absolute top-3 right-3 size-4 animate-spin text-muted-foreground"
              aria-label="Chargement"
            />
          ) : (
            search && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1.5 right-1"
                aria-label="Effacer la recherche"
                onClick={() => onSearchChange('')}
              >
                <X className="size-4" />
              </Button>
            )
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {busy ? 'Actualisation…' : `${total} résultat${total > 1 ? 's' : ''}`}
        </p>
      </div>
      <div
        className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-background"
        aria-busy={busy}
      >
        <Table
          aria-label={label}
          className="min-w-[340px]"
          containerProps={{
            className: 'min-h-0 overflow-auto overscroll-contain',
            role: 'region',
            'aria-label': `Tableau des ${label}`,
            tabIndex: 0,
          }}
        >
          <TableHeader className="sticky top-0 z-20 bg-muted">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={`px-4 ${columnClass(header.column.id)}`}
                  >
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={busy ? 'opacity-60' : undefined}>
            {loading || failed || rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="h-36 px-4 text-center text-muted-foreground"
                >
                  {failed
                    ? 'Les données ne sont pas disponibles.'
                    : loading
                      ? 'Chargement…'
                      : search.trim()
                        ? 'Aucun résultat pour cette recherche.'
                        : 'Aucun enregistrement pour le moment.'}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`px-4 py-3 ${columnClass(cell.column.id)}`}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex shrink-0 flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor={pageSizeId} className="text-xs text-muted-foreground">
            Lignes par page
          </Label>
          <NativeSelect
            id={pageSizeId}
            value={pagination.pageSize}
            disabled={busy}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
          >
            {[10, 20, 50, 100].map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <span className="text-xs text-muted-foreground">
            {failed ? '—' : `${from}–${to} sur ${total}`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs text-muted-foreground">
            Page {pagination.pageIndex + 1} sur {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Page précédente"
              disabled={busy || failed || !table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Page suivante"
              disabled={busy || failed || !table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
