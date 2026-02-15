/**
 * General-purpose helper functions.
 */

/**
 * Pause execution for a given number of milliseconds.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Clamp a number between a min and max value.
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Truncate a string and append an ellipsis if it exceeds maxLength.
 */
export const truncate = (str: string, maxLength: number): string =>
  str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
