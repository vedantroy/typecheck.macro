import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface Generic<X> {
    foo: Array<Record<number, Array<X | string | Array<X>>>>;
  }
  register("Generic");
  return __dumpAllIR;
};
