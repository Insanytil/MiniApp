/** Accent- and case-insensitive form of a string, for client-side search. */
export const searchable = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

/** Whether `haystack` contains `needle`, ignoring accents, case and padding. */
export const matchesSearch = (haystack: string, needle: string) =>
  searchable(haystack).includes(searchable(needle.trim()))
