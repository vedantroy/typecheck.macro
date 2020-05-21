import {
  __dumpAfterTypeResolution,
  register,
} from "../../dist/typecheck.macro";
import test from "ava";

test("resolve-circular-simple", (t) => {
  type B = { val: A };
  type A = B | null;
  register("A");
  t.snapshot(__dumpAfterTypeResolution("A", "B"));
});

test("resolve-chained", (t) => {
  interface X {}
  type Y = X;
  type Z = Y;
  register("Z");
  t.snapshot(__dumpAfterTypeResolution("X", "Y", "Z"));
});

test("resolve-generics", (t) => {
  interface GI<P1, P2> {}
  type GY<P1, P2 = number> = GI<P1, P2>;
  type GZ<P1> = GY<P1>;
  register("GZ");
  t.snapshot(__dumpAfterTypeResolution("GI", "GY", "GZ"));
});
