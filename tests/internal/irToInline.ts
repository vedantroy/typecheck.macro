import { isParenthesized } from "../../src/code-gen/irToInline";
import test from "ava";

test("is-parenthesized", (t) => {
  t.false(isParenthesized("()()"));
  t.true(isParenthesized("(()())"));
  t.throws(() => isParenthesized("("));
});
