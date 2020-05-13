import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface Foo {
    foo: string;
  }
  interface Bar {
    bar: Foo;
  }
  register("Bar");
  return __dumpAllIR();
};
