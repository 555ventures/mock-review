import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Stock shadcn `cn`: merges class lists and resolves Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
