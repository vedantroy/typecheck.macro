import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

export default () => {
  interface Foo {
    foo: string;
  }
  interface Bar {
    bar: Foo;
  }
  register("Bar");
  return __dumpAllIR;
};
