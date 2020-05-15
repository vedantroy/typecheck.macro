import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const validator = createValidator<{
    a: { b: { c: {}; d: { e: number } } };
  }>();
  tBV(t, validator, {
    input: { a: { b: { c: {}, d: { e: 42 } } } },
    returns: true,
  });
};
