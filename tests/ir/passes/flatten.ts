import {
  registerType,
  __dumpAfterTypeFlattening,
} from "../../../dist/typecheck.macro";
import test from "ava";

test("flatten-nested-chain", (t) => {
  interface RCC5 {}
  type RCC4 = RCC5;
  type RCC3 = RCC4 | RCC5;
  type RCC2 = RCC3 | RCC4;
  type RCC1 = RCC2 | RCC3;
  registerType("RCC1");
  t.snapshot(__dumpAfterTypeFlattening("RCC1"));
});

test("flatten-intersection", (t) => {
  type FI = string & ("hello" | "world");
  registerType("FI");
  t.snapshot(__dumpAfterTypeFlattening("FI"));
});

test("flatten-intersection-complex", (t) => {
  type A = ("a" | "b" | "c") & ("a" | "x" | "y");
  registerType("A");
  t.snapshot(__dumpAfterTypeFlattening("A"));
});

test("simplify-distribution", (t) => {
  type FP = string & (string | number);
  registerType("FP");
  t.snapshot(__dumpAfterTypeFlattening("FP"));
});

test("literals-edgecase", (t) => {
  type Edge = ("true" & true) | (null & "null") | (3 & "3");
  registerType("Edge");
  t.snapshot(__dumpAfterTypeFlattening("Edge"));
});
