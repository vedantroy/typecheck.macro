import {
  registerType,
  __dumpAfterRegistration,
} from "../../../dist/typecheck.macro";
import test from "ava";

test("generics-advanced", (t) => {
  interface Generic<W, X = W, Y = string, Z = Bar> {
    a: Record<string, Record<number, Z>>;
  }

  // This type should not appear in the IR
  type T = "Some_Type";

  interface Bar {}
  interface Foo<T, X = T> {}
  registerType("Generic");
  registerType("Foo");
  t.snapshot(__dumpAfterRegistration);
});
