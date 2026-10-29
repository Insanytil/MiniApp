export interface ListParams {
  page: number
  pageSize: number
  search: string
}

export interface PageResponse<T> {
  items: T[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

export function listSearchParams(params: ListParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize),
  })
  if (params.search.trim()) query.set('search', params.search.trim())
  return query.toString()
}

export function lastAvailablePage(totalPages: number) {
  return Math.max(1, totalPages)
}
