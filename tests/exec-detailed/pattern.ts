import { createDetailedValidator, register } from "../../dist/typecheck.macro";
import test from "ava";
import * as u from "../../src/type-ir/IRUtils";

test("pattern-basic", (t) => {
  // TODO: Incomplete test
  const x = createDetailedValidator<{
    628: number;
    hello: 42;
    'zoo\n"ba': 666;
  }>();
  let errs = [];
  t.false(x({}, errs));
  t.snapshot(errs);
  errs = [];
  t.false(x(undefined, errs));
  t.snapshot(errs);
});

test("pattern-nested", (t) => {
  const x = createDetailedValidator<{
    a: { b: { c: string } };
  }>();
  const errs = [];
  t.true(x({ a: { b: { c: "" } } }, errs));
  t.deepEqual(errs, []);
  t.false(x({ a: { b: { c: 3 } } }, errs));
  t.deepEqual(errs, [[`input["a"]["b"]["c"]`, 3, u.PrimitiveType("string")]]);
});

test("pattern-basic-hoisted", (t) => {
  interface Bar {
    val: string;
  }
  type A = Bar;
  register("A");
  register("Bar");
  const x = createDetailedValidator<{
    foo: A;
    foo2: A;
  }>();
  let errs = [];
  t.true(x({ foo: { val: "" }, foo2: { val: "" } }, errs));
  t.deepEqual(errs, []);
  t.false(x({ foo: undefined, foo2: { val: "" } }, errs));
});
