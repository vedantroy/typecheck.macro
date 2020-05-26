import { throwUnexpectedError } from "../macro-assertions";

export function hasAtLeast1Element<T>(array: T[]): array is [T, ...T[]] {
  return array.length >= 1;
}

export function hasAtLeast2Elements<T>(array: T[]): array is [T, T, ...T[]] {
  return array.length >= 2;
}

export function safeGet<K, V>(
  key: K,
  map: ReadonlyMap<K, V>,
  mapName?: string
): V {
  const val = map.get(key);
  if (val === undefined) {
    throwUnexpectedError(
      `expected ${key} to be in map${mapName !== undefined ? mapName : ""}`
    );
  }
  return val;
}
