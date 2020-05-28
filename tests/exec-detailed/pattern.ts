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
});

test("pattern-basic-hoisted", (t) => {
  // TODO: Incomplete test
  interface Bar {
    val: string;
  }
  register("Bar");
  const x = createDetailedValidator<{
    foo: Bar;
    foo2: Bar;
  }>();
  let errs = [];
  t.true(x({ foo: { val: "" }, foo2: { val: "" } }, errs));
});
