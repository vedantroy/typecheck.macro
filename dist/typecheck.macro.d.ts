import * as IR from "./IR"
export { IR }
interface BooleanOptions {
  circularRefs?: boolean;
}
export default function createValidator<T>(opts?: BooleanOptions): (value: unknown) => value is T;
interface DetailedOptions extends BooleanOptions {
  expectedValueAsIR?: boolean;
}
export function createDetailedValidator<T>(opts?: DetailedOptions): (value: unknown, errors: string[]) => value is T
export function registerType(typeName: string): () => void;

declare type TypeStats = Map<string, number>;
export interface TypeInfo {
    readonly typeStats: TypeStats;
    value: IR.IR;
    circular: boolean;
}

export const __dumpAfterRegistration: Map<string, IR.IR>
export function __dumpAfterTypeResolution(...typeNames: string[]): Map<string, IR.IR>
export function __dumpAfterTypeFlattening(...typeNames: string[]): Map<string, IR.IR>
export function __dumpInstantiatedIR<T>(): Map<string, TypeInfo>