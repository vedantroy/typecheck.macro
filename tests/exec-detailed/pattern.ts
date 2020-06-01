import { createDetailedValidator, register } from "../../dist/typecheck.macro";
import test from "ava";
import * as u from "../../src/type-ir/IRUtils";

const opts = { expectedValueAsIR: true };

test("pattern-basic", (t) => {
  // TODO: Incomplete test
  const x = createDetailedValidator<{
    628: number;
    hello: 42;
    'zoo\n"ba': 666;
  }>(opts);
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
  }>(opts);
  const errs = [];
  t.true(x({ a: { b: { c: "" } } }, errs));
  t.deepEqual(errs, []);
  t.false(x({ a: { b: { c: 3 } } }, errs));
  t.deepEqual(errs, [[`input["a"]["b"]["c"]`, 3, u.PrimitiveType("string")]]);
});

interface Bar {
  val: string;
}
register("Bar");

test("pattern-basic-hoisted", (t) => {
  type A = Bar;
  register("A");
  const x = createDetailedValidator<{
    foo: A;
    foo2: A;
  }>(opts);
  let errs = [];
  t.true(x({ foo: { val: "" }, foo2: { val: "" } }, errs));
  t.deepEqual(errs, []);
  t.false(x({ foo: undefined, foo2: { val: "" } }, errs));
});

test("pattern-advanced-hoisted", (t) => {
  const x = createDetailedValidator<{
    foo: Bar;
    foo2: { value: Bar };
  }>(opts);
  let errs = [];
  t.true(x({ foo: { val: "" }, foo2: { value: { val: "" } } }, errs));
  t.deepEqual(errs, []);
  t.false(x({ foo: { val: "" }, foo2: { value: { val: 3 } } }, errs));
  t.deepEqual(errs, [
    ['input["foo2"]["value"]["val"]', 3, u.PrimitiveType("string")],
  ]);
  errs = [];
  t.false(x({ foo: { val: "" }, foo2: { value: null } }, errs));
  t.snapshot(errs);
});
