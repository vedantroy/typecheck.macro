import createValidator, { register } from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("interface-basic", (t) => {
  interface Foo {
    val: string;
  }
  register("Foo");
  const namedTypeV = createValidator<Foo>();
  tBV(t, namedTypeV, {
    input: { val: "hello" },
    returns: true,
  });
  tBV(t, namedTypeV, {
    inputs: ["hello", null, {}],
    returns: false,
  });
});
