import {
  register,
  __dumpAfterTypeFlattening,
} from "../../../dist/typecheck.macro";
import test from "ava";

test("flatten-nested-chain", (t) => {
  interface RCC5 {}
  type RCC4 = RCC5;
  type RCC3 = RCC4 | RCC5;
  type RCC2 = RCC3 | RCC4;
  type RCC1 = RCC2 | RCC3;
  register("RCC1");
  t.snapshot(__dumpAfterTypeFlattening("RCC1"));
});

test("flatten-intersection", (t) => {
  type FI = string & ("hello" | "world");
  register("FI");
  t.snapshot(__dumpAfterTypeFlattening("FI"));
});

test("flatten-intersection-complex", (t) => {
  type A = ("a" | "b" | "c") & ("a" | "x" | "y");
  register("A");
  t.snapshot(__dumpAfterTypeFlattening("A"));
});

test("simplify-distribution", (t) => {
  type FP = string & (string | number);
  register("FP");
  t.snapshot(__dumpAfterTypeFlattening("FP"));
});
