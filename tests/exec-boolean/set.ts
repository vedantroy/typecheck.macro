import createValidator from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("set-basic", (t) => {
  const validator = createValidator<Set<number>>();
  tBV(t, validator, {
    inputs: [new Set([1]), new Set([]), new Set()],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [undefined, null, "hello", 1, {}, [], new Map(), new Set(["a"])],
    returns: false,
  });
});

test("set-complex", (t) => {
  const validator = createValidator<Set<number | Set<number>>>();
  tBV(t, validator, {
    inputs: [
      new Set(),
      new Set([new Set()]),
      new Set([1, new Set()]),
      new Set([1, new Set([1])]),
    ],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [
      undefined,
      null,
      new Set([""]),
      new Set(["", new Set()]),
      new Set([1, new Set([1, "he"])]),
    ],
    returns: false,
  });
});
