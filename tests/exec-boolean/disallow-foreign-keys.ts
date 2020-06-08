import createValidator from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("basic-disallowed", (t) => {
  const x = createValidator<{ a?: number }>({ allowForeignKeys: false });
  tBV(t, x, {
    inputs: [{}, { a: 3 }],
    returns: true,
  });
  tBV(t, x, {
    inputs: [{ b: 3 }, { a: 3, b: 3 }, { 3: 5 }, { NaN: 4 }],
    returns: false,
  });
});

test("non-numerics-disallowed", (t) => {
  const x = createValidator<{ a?: number; [key: number]: string }>({
    allowForeignKeys: false,
  });
  tBV(t, x, {
    inputs: [{}, { a: 3 }, { NaN: "", Infinity: "" }],
    returns: true,
  });
  tBV(t, x, {
    inputs: [{ b: "" }, { NaN: 3 }, { Infinity: 42 }, { a: 3, b: "" }],
    returns: false,
  });
});

test("none-disallowed", (t) => {
  const x = createValidator<{ a?: "Hello"; [key: string]: string }>({
    allowForeignKeys: false,
  });
  tBV(t, x, {
    inputs: [{}, { a: "Hello" }, { NaN: "", Infinity: "" }, { b: "" }],
    returns: true,
  });
  tBV(t, x, {
    inputs: [{ a: 3 }, { a: "" }, { b: 3 }, { NaN: 3 }],
    returns: false,
  });
});
