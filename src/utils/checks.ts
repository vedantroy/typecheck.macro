export function hasAtLeast1Element<T>(array: T[]): array is [T, ...T[]] {
  return array.length >= 1;
}

export function hasAtLeast2Elements<T>(array: T[]): array is [T, T, ...T[]] {
  return array.length >= 2;
}
