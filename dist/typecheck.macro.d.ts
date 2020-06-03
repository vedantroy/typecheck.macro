import * as IR from "./IR";
export { IR };
interface BooleanOptions {
  // True by default. If false, then circular references will not work.
  circularRefs?: boolean;
}
export default function createValidator<T>(
  opts?: BooleanOptions
): (value: unknown) => value is T;
interface DetailedOptions extends BooleanOptions {
  // False by default. If true, then the expected value in an error tuple
  // will be a JSON object representing the macro's internal representation of the expected type
  // instead of a stringified representation of the type
  expectedValueAsIR?: boolean;
}
export function createDetailedValidator<T>(
  opts?: DetailedOptions
): (
  value: unknown,
  errs: Array<[string, unknown, IR.IR | string]>
) => value is T;
export function registerType(typeName: string): () => void;

declare type TypeStats = Map<string, number>;
export interface TypeInfo {
  readonly typeStats: TypeStats;
  value: IR.IR;
  circular: boolean;
}

export const __dumpAfterRegistration: Map<string, IR.IR>;
export function __dumpAfterTypeResolution(
  ...typeNames: string[]
): Map<string, IR.IR>;
export function __dumpAfterTypeFlattening(
  ...typeNames: string[]
): Map<string, IR.IR>;
export function __dumpInstantiatedIR<T>(): Map<string, TypeInfo>;
