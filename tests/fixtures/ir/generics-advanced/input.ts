import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface Generic<X, Y = string, Z = Record<number, Y>> {
    a: Record<string, Record<number, Z>>;
  }

  // This type should not appear in the IR
  type T = "Some_Type";

  interface Foo<T, X = T> {
    bar: T;
    baz: X;
  }
  register("Generic");
  register("Foo");
  return __dumpAllIR;
};
