import {
  __dumpAfterTypeResolution,
  register,
} from "../../dist/typecheck.macro";
import test from "ava";

test("resolve-circular-1", (t) => {
  type B = { val: A };
  type A = B | null;
  register("A");
  t.snapshot(__dumpAfterTypeResolution("A", "B"));
});

test("resolve-circular-2", (t) => {
  type Circular<T> = { next: Circular<T> };
  register("Circular")
  t.snapshot(__dumpAfterTypeResolution("Circular"))
})

test("resolve-chained", (t) => {
  interface X {}
  type Y = X;
  type Z = Y;
  register("Z");
  t.snapshot(__dumpAfterTypeResolution("X", "Y", "Z"));
});

test("resolve-chained-complex", (t) => {
  interface RCC5 {}
  type RCC4 = RCC5;
  type RCC3 = RCC4 | RCC5;
  type RCC2 = RCC3 | RCC4;
  type RCC1 = RCC2 | RCC3;
  // ((RCC5 | RCC5) | RCC4) | (RCC5 | RCC5)
  register("RCC1");
  t.snapshot(__dumpAfterTypeResolution("RCC1"));
});

test("resolve-generics", (t) => {
  interface GI<P1, P2> {}
  type GY<P1, P2 = number> = GI<P1, P2>;
  type GZ<P1> = GY<P1>;
  register("GZ");
  t.snapshot(__dumpAfterTypeResolution("GI", "GY", "GZ"));
});

test("resolve-interface", (t) => {
  type Baz = Foo;
  type Bar = Baz;
  interface Foo {
    val: Bar;
  }
  register("Foo");
  t.snapshot(__dumpAfterTypeResolution("Baz", "Bar", "Foo"));
});