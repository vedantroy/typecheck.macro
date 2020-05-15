// TODO: Why can this be called without a type parameter
export default function createValidator<T>(): (value: unknown) => value is T
export function register(typeName: string): () => void

// Functions used for testing (and maybe curious people)
export const __resetAllIR: string
// TODO: Set the type to IR
export const __dumpAllIR: object