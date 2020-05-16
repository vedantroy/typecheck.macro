import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const validator = createValidator<{ a: number }>();
  tBV(t, validator, { input: { a: 3 }, returns: true });
  tBV(t, validator, { inputs: [{ a: "hello" }, undefined], returns: false });
};
