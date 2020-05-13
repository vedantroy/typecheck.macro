import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  type T = { a: string; optional?: number; nest: { c?: number; d: string } };
  register("T");
  return __dumpAllIR;
};
