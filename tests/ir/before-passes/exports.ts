import {
    registerType,
    __dumpAfterRegistration,
  } from "../../../dist/typecheck.macro";
import test from "ava";

export interface Foo {}
registerType('Foo')
  
test("exports-registered", (t) => {
  interface Bar {
      val: Foo;
  }
  registerType('Bar')
  t.snapshot(__dumpAfterRegistration)
});