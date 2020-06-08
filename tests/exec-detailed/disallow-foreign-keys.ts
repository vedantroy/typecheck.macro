import { createDetailedValidator } from "../../dist/typecheck.macro";
import * as u from "../../src/type-ir/IRUtils";
import test from "ava";

test("basic-disallowed", (t) => {
  const x = createDetailedValidator<{ a?: number }>({
    allowForeignKeys: false,
    expectedValueAsIR: true,
  });
  let errs = [];
  t.true(x({}, errs));
  t.true(x({ a: 3 }, errs));
  t.deepEqual(errs, []);

  t.false(x({ b: 3 }, errs));
  t.deepEqual(errs, [['input["b"]', 3, u.NonExistentKey()]]);
  errs = [];
  t.false(x({ 3: 42 }, errs));
  t.deepEqual(errs, [['input["3"]', 42, u.NonExistentKey()]]);
});

test("non-numerics-disallowed", (t) => {
  const x = createDetailedValidator<{ a?: number; [key: number]: string }>({
    allowForeignKeys: false,
  });
  let errs = [];
  t.true(x({}, errs));
  t.true(x({ a: 3 }, errs));
  t.true(x({ NaN: "" }, errs));
  t.true(x({ Infinity: "" }, errs));
  t.deepEqual(errs, []);

  t.false(x({ b: "" }, errs));
  const basicErr = [
    ['input["b"]', "", "unexpected key that was not in original type"],
  ];
  t.deepEqual(errs, basicErr);
  errs = [];
  t.false(x({ a: 3, b: "" }, errs));
  t.deepEqual(errs, basicErr);
});

test("none-disallowed", (t) => {
  const x = createDetailedValidator<{ a?: "Hello"; [key: string]: string }>({
    allowForeignKeys: false,
    expectedValueAsIR: true,
  });
  const errs = [];
  t.true(x({}, errs));
  t.true(x({ a: "Hello" }, errs));
  t.true(x({ NaN: "Hello", Infinity: "" }, errs));
  t.true(x({ b: "" }, errs));
  t.deepEqual(errs, []);

  t.false(x({ b: 3 }, errs));
  t.deepEqual(errs, [['input["b"]', 3, u.PrimitiveType("string")]]);
});
