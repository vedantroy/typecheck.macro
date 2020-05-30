import { createDetailedValidator, register } from "../../dist/typecheck.macro";
import { format } from "prettier";
import test from "ava";

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
