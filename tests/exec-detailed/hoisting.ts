import { createDetailedValidator, register } from "../../dist/typecheck.macro";
import test from "ava";
import * as u from "../../src/type-ir/IRUtils";

test("heterogeneous-hoisting", (t) => {
  // Purpose: With property "foo1", the hoisted function for type Foo
  // should report errors, with property foo2, the hoisted function type
  // should not report errors because it is part of a union type and union
  // types don't report errors (they leave it to the parent)
  interface Foo {
    val: string;
  }
  register("Foo");
  const x = createDetailedValidator<{ foo1: Foo; foo2: Foo | null }>({
    expectedValueAsIR: true,
  });
  let errs = [];
  t.true(x({ foo1: { val: "" }, foo2: null }, errs));
  t.deepEqual(errs, []);
  t.false(x({ foo1: { val: "" }, foo2: { val: 3 } }, errs));
  t.snapshot(errs);
  errs = [];
  t.false(x({ foo1: { val: 3 }, foo2: null }, errs));
  t.deepEqual(errs, [['input["foo1"]["val"]', 3, u.PrimitiveType("string")]]);
});
