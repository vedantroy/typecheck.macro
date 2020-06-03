import {
  __dumpAfterTypeResolution,
  registerType,
  __dumpAfterTypeFlattening,
} from "../../../dist/typecheck.macro";
import test from "ava";

test("resolve-circular-1", (t) => {
  type B = { val: A };
  type A = B | null;
  registerType("A");
  t.snapshot(__dumpAfterTypeResolution("A", "B"));
});

test("resolve-circular-2", (t) => {
  type Circular<T> = { next: Circular<T> };
  registerType("Circular");
  t.snapshot(__dumpAfterTypeResolution("Circular"));
});

test("resolve-chained", (t) => {
  interface X {}
  type Y = X;
  type Z = Y;
  registerType("Z");
  t.snapshot(__dumpAfterTypeResolution("X", "Y", "Z"));
});

test("resolve-chained-complex", (t) => {
  interface RCC5 {}
  type RCC4 = RCC5;
  type RCC3 = RCC4 | RCC5;
  type RCC2 = RCC3 | RCC4;
  type RCC1 = RCC2 | RCC3;
  registerType("RCC1");
  t.snapshot(__dumpAfterTypeResolution("RCC1"));
});

test("resolve-generics", (t) => {
  interface GI<P1, P2> {}
  type GY<P1, P2 = number> = GI<P1, P2>;
  type GZ<P1> = GY<P1>;
  registerType("GZ");
  t.snapshot(__dumpAfterTypeResolution("GI", "GY", "GZ"));
});

test("resolve-map", (t) => {
  // This test isn't really needed because Map
  // is just translated to a type, like GI, but...
  // it's ok to be paranoid.
  type RM2<P1, P2 = number> = Map<P1, P2>;
  type RM<P1> = RM2<P1>;
  registerType("RM");
  t.snapshot(__dumpAfterTypeResolution("RM", "RM2"));
});

test("resolve-interface", (t) => {
  type Baz = Foo;
  type Bar = Baz;
  interface Foo {
    val: Bar;
  }
  registerType("Foo");
  t.snapshot(__dumpAfterTypeResolution("Baz", "Bar", "Foo"));
});

test("resolve-interface-circular-generic", (t) => {
  interface RICG<T> {
    val: RICG<T> | null;
  }
  registerType("RICG");
  t.snapshot(__dumpAfterTypeResolution("RICG"));
});
