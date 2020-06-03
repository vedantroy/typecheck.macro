import { createDetailedValidator, registerType } from "../../dist/typecheck.macro";
import test from "ava";

test("index-signatures", (t) => {
  interface Bar {
    [key: string]: string | number;
  }
  registerType("Bar");
  const x = createDetailedValidator<Bar>();
  let errs = [];
  t.false(x({ hello: true }, errs));
  t.snapshot(errs);
  errs = [];
  t.false(x(null, errs));
  t.snapshot(errs);
});

test("literals", (t) => {
  const x = createDetailedValidator<"Hello World">();
  const y = createDetailedValidator<42>();
  let errs = [];
  t.true(x("Hello World", errs));
  t.deepEqual(errs, []);
  t.false(x(null, errs));
  t.snapshot(errs);
  errs = [];
  t.true(y(42, errs));
  t.deepEqual(errs, []);
  t.false(y(null, errs));
  t.snapshot(errs);
});
