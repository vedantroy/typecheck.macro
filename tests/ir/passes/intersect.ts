import {
  __dumpInstantiatedIR,
  registerType,
} from "../../../dist/typecheck.macro";
import test from "ava";

test("intersect-literals", (t) => {
  t.snapshot(__dumpInstantiatedIR<"Hello" & string>());
  t.snapshot(__dumpInstantiatedIR<string & "Hello">());
  t.snapshot(__dumpInstantiatedIR<3 & number>());
  t.snapshot(__dumpInstantiatedIR<number & 3>());
  t.snapshot(__dumpInstantiatedIR<true & boolean>());
  t.snapshot(__dumpInstantiatedIR<boolean & false>());
  t.snapshot(__dumpInstantiatedIR<null & null>());
  t.snapshot(__dumpInstantiatedIR<undefined & undefined>());
  t.snapshot(__dumpInstantiatedIR<object & { a: 3 }>());
  t.snapshot(__dumpInstantiatedIR<{ a: 3 } & object>());
});

test("intersect-literals-complex", (t) => {
  t.snapshot(
    __dumpInstantiatedIR<("a" | "b" | "c") & ("a" | "x" | "y" | "b")>()
  );
});

test("intersect-mixed", (t) => {
  t.snapshot(__dumpInstantiatedIR<string & ("hello" | 3)>());
});

test("tuples-same-length", (t) => {
  t.snapshot(__dumpInstantiatedIR<[string, string] & ["hello", "world"]>());
  t.snapshot(
    __dumpInstantiatedIR<
      [string, string?, string?] & [string, string, string]
    >()
  );
  t.snapshot(
    __dumpInstantiatedIR<
      [string, string?, "Hello"?] & [string, string, string?]
    >()
  );
});

test("tuples-rest", (t) => {
  t.snapshot(
    __dumpInstantiatedIR<[string, string] & ["hello", "world", ...string[]]>()
  );
  t.snapshot(
    __dumpInstantiatedIR<
      [...Array<string | number>] & [3, "hello", string, number]
    >()
  );
  t.snapshot(
    __dumpInstantiatedIR<
      [string, ...string[]] & [string, ...Array<string | number>]
    >()
  );
});

test("tuple-array", (t) => {
  t.snapshot(__dumpInstantiatedIR<[string, string] & Array<string | number>>());
  t.snapshot(
    __dumpInstantiatedIR<[string, string?] & Array<string | number>>()
  );
});

test("set", (t) => {
  t.snapshot(__dumpInstantiatedIR<Set<string> & Set<"hello">>());
});

test("object-pattern-simple", (t) => {
  t.snapshot(__dumpInstantiatedIR<{ hello: string } & { world: number }>());
  t.snapshot(
    __dumpInstantiatedIR<{ hello: string | number } & { hello: number }>()
  );
});

test("object-pattern-optional-properties", (t) => {
  t.snapshot(
    __dumpInstantiatedIR<
      { hello?: string; opt?: string; required: string } & {
        hello: string;
        world?: string;
        opt?: string;
      }
    >()
  );
});

test("object-pattern-index-signature", (t) => {
  t.snapshot(
    __dumpInstantiatedIR<
      { [key: string]: "Hello" } & { [key: number]: "Hello" | "World" }
    >()
  );
  t.snapshot(
    __dumpInstantiatedIR<
      { [key: string]: string; [key: number]: "World" } & {
        [key: string]: "Hello" | "World";
      }
    >()
  );
});

test("complex-1", (t) => {
  type LinkedList<T> = T & { next: LinkedList<T> };
  interface Person {
    name: string;
  }
  registerType("LinkedList");
  registerType("Person");

  t.snapshot(__dumpInstantiatedIR<LinkedList<Person>>());
});
