import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

export default () => {
  type T<A> = A;
  register("T");
  return __dumpAllIR;
};
