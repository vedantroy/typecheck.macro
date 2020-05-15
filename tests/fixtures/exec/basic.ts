import createValidator from "../../../dist/typecheck.macro";
import { assertBooleanValidator as aBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const validator = createValidator<{ a: number }>();
  aBV(t, validator, { input: { a: 3 }, returns: true });
  aBV(t, validator, { input: { a: "hello" }, returns: false });
};
