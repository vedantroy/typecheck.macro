import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

/**
 * 1. Empty/non-empty tuples work
 * 2. Tuples with optional elements work
 * 3. Tuples with rest elements work
 * 4. Tuples can reference external types (like "foo")
 */
export default () => {
  interface foo {}
  type Empty = [];
  type NoOptional = [string, foo];
  type Optional = [string, foo?, foo?];
  type Rest = [foo, ...number[]];
  register("Empty");
  register("NoOptional");
  register("Optional");
  register("Rest");
  return __dumpAllIR;
};
