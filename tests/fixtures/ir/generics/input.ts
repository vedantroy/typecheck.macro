import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

export default () => {
  interface Generic<X, Y, Z = string> {
    a: X;
    b: Record<string, Y>;
    c: Z;
  }
  register("Generic");
  return __dumpAllIR;
};
