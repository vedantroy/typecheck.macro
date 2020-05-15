import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  type Type = Array<string>
  type ReadonlyType = ReadonlyArray<string>
  type Literal = string[]
  register("Type");
  register("ReadonlyType");
  register("Literal");
  return __dumpAllIR;
};