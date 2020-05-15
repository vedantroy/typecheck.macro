import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";
/**
 * 1. Array generics (Array/ReadonlyArray) are transformed into literals
 * 2. Array literals sanity check
 */

export default () => {
  type Type = Array<string>;
  type ReadonlyType = ReadonlyArray<string>;
  type Literal = string[];
  register("Type");
  register("ReadonlyType");
  register("Literal");
  return __dumpAllIR;
};
