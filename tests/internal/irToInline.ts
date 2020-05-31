import { isParenthesized } from "../../src/code-gen/irToInline";
import test from "ava";

test("is-parenthesized", (t) => {
  t.false(isParenthesized("()()"));
  t.false(isParenthesized("foo === true"));
  t.true(isParenthesized("(()())"));
  t.throws(() => isParenthesized("("));
});
