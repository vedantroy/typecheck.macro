import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

export default () => {
  interface Foo {
    foo: string;
  }

  interface Bar {
    bar: string;
  }

  type BazDefault = "hello";

  interface Baz<T = BazDefault> {
    baz: string | BazDefault;
  }

  type Qux = Baz;
  type T = Foo | Bar | Qux | 3 | "world";
  register("T");
  return __dumpAllIR;
};
