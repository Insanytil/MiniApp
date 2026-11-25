/** Removes diacritics (é → e, ç → c) using compatibility decomposition. */
export const withoutAccents = (value: string) =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')

/** Accent- and case-insensitive form of a string, for client-side search. */
export const searchable = (value: string) =>
  withoutAccents(value).toLocaleLowerCase()

/** Whether `haystack` contains `needle`, ignoring accents, case and padding. */
export const matchesSearch = (haystack: string, needle: string) =>
  searchable(haystack).includes(searchable(needle.trim()))
