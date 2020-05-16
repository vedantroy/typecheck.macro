import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
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
};
