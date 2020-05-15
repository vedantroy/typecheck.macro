import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

export default () => {
  type Type = Array<string>;
  type ReadonlyType = ReadonlyArray<string>;
  type Literal = string[];
  register("Type");
  register("ReadonlyType");
  register("Literal");
  return __dumpAllIR;
};
