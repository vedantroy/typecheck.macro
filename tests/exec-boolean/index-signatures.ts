import createValidator, { registerType } from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("nested-index-sigs", (t) => {
  interface Zorg {
    [key: string]: { [key: string]: number };
  }
  registerType("Zorg");
  const x = createValidator<Zorg>();
  tBV(t, x, {
    input: { a: { b: "" } },
    returns: false,
  });
});
