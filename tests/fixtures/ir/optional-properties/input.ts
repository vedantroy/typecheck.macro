import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface Foo {
    foo: string;
    opt?: number;
  }
  register("Foo");
  return __dumpAllIR();
};
