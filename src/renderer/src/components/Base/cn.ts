import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Join classes, and let a later one win.
 *
 * A recipe gives a button `h-9 px-3.5`, and a caller passing `px-2` wants
 * `px-2`, not both. Without the merge both land in one class attribute and the
 * winner is decided by the order Tailwind happened to write them into the
 * stylesheet, which is nothing anybody reading the template can see.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
