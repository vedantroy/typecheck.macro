import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

/**
 * 1. Generic parameter defaults can reference previous generic parameters
 * 2. Generic parameter defaults can reference external types (string, Foo)
 * 3. Referencing an earlier generic parameter
 * does not cause the registering of a type with the same name in the same scope
 */

export default () => {
  interface Generic<W, X = W, Y = string, Z = Bar> {
    a: Record<string, Record<number, Z>>;
  }

  // This type should not appear in the IR
  type T = "Some_Type";

  interface Bar {}
  interface Foo<T, X = T> {}
  register("Generic");
  register("Foo");
  return __dumpAllIR;
};
