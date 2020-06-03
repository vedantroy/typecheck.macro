import { registerType, __dumpInstantiatedIR } from "../../../dist/typecheck.macro";
import test from "ava";

test("instantiate-simple", (t) => {
  interface Foo<T> {
    val: T;
  }
  registerType("Foo");
  t.snapshot(__dumpInstantiatedIR<Foo<string>>());
});

test("type-aliases-inlined", (t) => {
  type TAI = any;
  registerType("TAI");
  t.snapshot(__dumpInstantiatedIR<{ a: TAI }>());
});

test("stats-correct-1", (t) => {
  type D = string;
  type C = D;
  type B = D;
  type A = B | C;
  registerType("A");
  t.snapshot(__dumpInstantiatedIR<A>());
});

test("circular-1", (t) => {
  type Baz = SC2;
  type Bar = Baz;
  interface SC2 {
    val: Bar | string;
  }
  registerType("SC2");
  t.snapshot(__dumpInstantiatedIR<SC2>());
});

test("resolve-circular-2", (t) => {
  type Circular<T> = { next: Circular<T> };
  registerType("Circular");
  t.snapshot(__dumpInstantiatedIR<Circular<string>>());
});

test("resolve-circular-3", (t) => {
  type RCB = { val: RCA };
  type RCA = RCB | null;
  registerType("RCA");
  t.snapshot(__dumpInstantiatedIR<RCA>());
});

test("merge-arrays", (t) => {
  type Arr<T> = T[] | Array<T> | ReadonlyArray<T>;
  registerType("Arr");
  t.snapshot(__dumpInstantiatedIR<Arr<string>>());
});

test("merge-sets", (t) => {
  type MS<T> = Set<T> | ReadonlySet<T>;
  registerType("MS");
  t.snapshot(__dumpInstantiatedIR<MS<string>>());
});

test("merge-maps", (t) => {
  type FM<T, K = number> = Map<T, K> | ReadonlyMap<K, T> | ReadonlyMap<K, T>;
  registerType("FM");
  t.snapshot(__dumpInstantiatedIR<FM<string>>());
});

test("complex-type-parameter", (t) => {
  type Circular2<T> = { next: Circular2<T> };
  type STR = string;
  registerType("Circular2");
  registerType("STR");
  t.snapshot(
    __dumpInstantiatedIR<
      Circular2<string> | Circular2<string> | Circular2<number> | STR
    >()
  );
});
