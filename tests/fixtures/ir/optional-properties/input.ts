import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

export default () => {
  interface Foo {
    foo: string;
    opt?: number;
  }
  register("Foo");
  return __dumpAllIR;
};
