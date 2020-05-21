import {
  register,
  __dumpAfterRegistration,
} from "../../../dist/typecheck.macro";
import test from "ava";

test("normalize-arrays", (t) => {
  type GenericArrayType = Array<string>;
  type GenericReadonlyArrayType = ReadonlyArray<string>;
  type LiteralArrayType = string[];
  register("GenericArrayType");
  register("GenericReadonlyArrayType");
  register("LiteralArrayType");
  t.snapshot(__dumpAfterRegistration);
});
