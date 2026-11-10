import type { AriaAttributes } from 'react'

/** True for aria-invalid values that mark a field invalid. */
export function isAriaInvalid(value: AriaAttributes['aria-invalid']): boolean {
  return value === true || value === 'true'
}

/**
 * Splits a caller's Tailwind className for a Mantine input between its two
 * elements: layout classes (width, margin, flex, grid, display, position) go
 * on the wrapper, which is the root; classes that style the field itself
 * (height, padding, text, background, border, focus ring, resize) go on the
 * <input> or <textarea>, as they did on the shadcn field.
 */
const FIELD_UTILITY =
  /^-?(h|min-h|max-h|p|px|py|pt|pb|pl|pr|ps|pe|text|font|bg|border|rounded|ring|shadow|outline|leading|tracking|resize|overflow|overflow-x|overflow-y|caret|accent|placeholder|indent|align|whitespace|break|truncate|tabular-nums|italic|not-italic|uppercase|lowercase|capitalize|normal-case|cursor|opacity|transition|duration|selection)(-|$)/

// Variants that only make sense on the field element
const FIELD_VARIANT = /^(placeholder|file|focus|focus-visible|focus-within|disabled|enabled|read-only|invalid|aria-invalid|autofill)$/

function isFieldClass(token: string): boolean {
  const parts = token.split(':')
  const utility = parts.pop()!.replace(/^!/, '')
  if (parts.some((variant) => FIELD_VARIANT.test(variant))) return true
  // Arbitrary properties such as [field-sizing:content]
  if (utility.startsWith('[')) return true
  return FIELD_UTILITY.test(utility)
}

export function splitFieldClassName(className: string | undefined): { root?: string; field?: string } {
  if (!className) return {}
  const root: string[] = []
  const field: string[] = []
  for (const token of className.split(/\s+/)) {
    if (token) (isFieldClass(token) ? field : root).push(token)
  }
  return { root: root.join(' ') || undefined, field: field.join(' ') || undefined }
}
