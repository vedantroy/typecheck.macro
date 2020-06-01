import { createDetailedValidator } from "../../dist/typecheck.macro";
import test from "ava";
import * as u from "../../src/type-ir/IRUtils";

const opts = { expectedValueAsIR: true };

test("tuple-basic", (t) => {
  const x = createDetailedValidator<[number]>(opts);
  let errs = [];
  t.true(x([1], errs));
  t.deepEqual(errs, []);
  t.false(x(undefined, errs));
  t.snapshot(errs);
  errs = [];
  t.false(x([1, 2], errs));
  t.snapshot(errs);
  errs = [];

  t.false(x(["a"], errs));
  t.deepEqual(errs, [["input[0]", "a", u.PrimitiveType("number")]]);
});

test("tuple-rest", (t) => {
  const x = createDetailedValidator<[number, ...string[]]>(opts);
  let errs = [];
  t.true(x([1], errs));
  t.deepEqual(errs, []);
  t.false(x(undefined, errs));
  t.snapshot(errs);
  errs = [];
  t.true(x([1, "a", "b"], errs));
  t.deepEqual(errs, []);
  t.false(x([1, "a", 1], errs));
  t.deepEqual(errs, [["input[2]", 1, u.PrimitiveType("string")]]);
  errs = [];
  t.false(x([1, "a", null], errs));
  t.deepEqual(errs, [["input[2]", null, u.PrimitiveType("string")]]);

  const y = createDetailedValidator<[number, ...Array<[number, string]>]>(opts);
  errs = [];
  t.true(y([1, [1, "hello"]], errs));
  t.false(y([1, [1, 3]], errs));
  t.deepEqual(errs, [["input[1][1]", 3, u.PrimitiveType("string")]]);
  errs = [];

  const z = createDetailedValidator<[number, ...Array<[number, ...string[]]>]>(
    opts
  );
  t.true(z([3, [1, "e", "f"]], errs));
  t.deepEqual(errs, []);

  const z2 = createDetailedValidator<
    [number, ...Array<Array<[number, string, ...number[]]>>]
  >(opts);
  t.true(z2([3, [[3, "a", 1]]], errs));
  t.deepEqual(errs, []);

  t.false(z2([3, [[3, "a", 1, "b"]]], errs));
  t.deepEqual(errs, [["input[1][0][3]", "b", u.PrimitiveType("number")]]);
});
