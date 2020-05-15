import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";
/**
 * Generic parameters work in interfaces and type aliases
 */

export default () => {
  interface G1<X> {
    a: X;
  }
  type G2<X> = X;
  register("G1");
  register("G2");
  return __dumpAllIR;
};
