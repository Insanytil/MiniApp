import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { lastAvailablePage } from './server-pagination'
import type { ListParams } from './server-pagination'

export function useListPageBoundary(
  query: {
    data?: { pagination: { total_pages: number } }
    isPlaceholderData: boolean
  },
  list: { params: ListParams; setParams: Dispatch<SetStateAction<ListParams>> },
) {
  const totalPages = query.isPlaceholderData
    ? undefined
    : query.data?.pagination.total_pages
  const { page } = list.params
  const { setParams } = list
  useEffect(() => {
    if (totalPages === undefined) return
    const lastPage = lastAvailablePage(totalPages)
    if (page > lastPage)
      setParams((previous) => ({ ...previous, page: lastPage }))
  }, [totalPages, page, setParams])
}
