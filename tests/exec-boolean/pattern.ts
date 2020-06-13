import createValidator, { registerType } from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("basic-pattern", (t) => {
  const validator = createValidator<{ a: number }>();
  tBV(t, validator, { input: { a: 3 }, returns: true });
  tBV(t, validator, {
    inputs: [{ a: "hello" }, null, undefined],
    returns: false,
  });
});

test("literal-keys", (t) => {
  const validator = createValidator<{ a: number; 3: string }>();
  tBV(t, validator, { input: { a: 3, 3: "hello" }, returns: true });
  tBV(t, validator, {
    inputs: [{ a: 3 }, null, undefined, { a: 3, 3: 3 }],
    returns: false,
  });
});

test("nested-pattern", (t) => {
  const basicV = createValidator<{ b: {} }>();
  const complexV = createValidator<{ a: { b: {}; c: number } }>();
  tBV(t, basicV, {
    input: { b: {} },
    returns: true,
  });
  tBV(t, basicV, {
    inputs: [{ b: null }, { b: undefined }, {}],
    returns: false,
  });
  tBV(t, complexV, {
    input: { a: { b: {}, c: 3 } },
    returns: true,
  });
  tBV(t, complexV, {
    inputs: [{ a: null }, { a: { c: 42 } }],
    returns: false,
  });
});

test("optional-properties", (t) => {
  const optionalV = createValidator<{ a?: string }>();
  tBV(t, optionalV, {
    inputs: [{}, { a: "hello" }, { a: undefined }],
    returns: true,
  });
  tBV(t, optionalV, {
    input: [{ a: 3 }],
    returns: false,
  });
});

test("index-signatures", (t) => {
  const indexV = createValidator<{
    [key: string]: string | number;
    [key: number]: string;
  }>();
  tBV(t, indexV, {
    input: [
      {},
      { a: "s", b: 3, 3: "s" },
      { a: "s", b: 3, Infinity: "s", NaN: "s" },
    ],
    returns: true,
  });
  tBV(t, indexV, {
    input: [{ 3: 3 }, { a: true }, { Infinity: 3 }, { NaN: 3 }, undefined],
    returns: false,
  });
});
