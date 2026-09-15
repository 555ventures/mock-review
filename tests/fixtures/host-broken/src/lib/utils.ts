export type ClassValue = string | false | null | undefined

/** Joins class names, dropping falsy values. Never imported directly by a screen. */
export function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(' ')
}
