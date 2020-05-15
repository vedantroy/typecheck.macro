import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";
/**
 * 1. tuples / unions support generic parameters
 * 2. complex heterogeneous type mixtures work
 */

export default () => {
  type T<A> = {
    tuple: [A, "hello", 42, true, Array<A | null>];
    union: "world" | Array<A | 666 | false>;
  }
  register("T")
  return __dumpAllIR;
};