import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface Generic<X, Y, Z = string> {
    a: X;
    b: Record<string, Y>;
    c: Z;
  }
  register("Generic");
  return __dumpAllIR;
};
