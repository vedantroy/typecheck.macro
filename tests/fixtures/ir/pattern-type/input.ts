import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

export default () => {
  type T = { a: string; optional?: number; nest: { c?: number; d: string } };
  register("T");
  return __dumpAllIR;
};
