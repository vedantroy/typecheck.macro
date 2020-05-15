import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const validator = createValidator<number[]>();
  tBV(t, validator, {
    inputs: [[], [1]],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [undefined, null, "hello", 1, {}, new Set(), new Map()],
    returns: false,
  });
};
