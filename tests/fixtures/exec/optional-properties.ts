import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const optionalV = createValidator<{ a?: string }>();

  tBV(t, optionalV, {
    inputs: [{}, { a: "hello" }, { a: undefined }],
    returns: true,
  });
  tBV(t, optionalV, {
    input: [{ a: 3 }],
    returns: false,
  });
};
