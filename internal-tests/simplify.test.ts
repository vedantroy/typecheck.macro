import { simplify } from "../src/type-ir/simplifyIR";
import test from "ava";
import type { Union, PrimitiveType } from "../src/type-ir/typeIR";

test("simplify-union", (t) => {
  const nonFlattened: Union = {
    type: "union",
    childTypes: [
      { type: "primitiveType", typeName: "number" } as PrimitiveType,
      {
        type: "union",
        childTypes: [
          { type: "primitiveType", typeName: "string" } as PrimitiveType,
          { type: "primitiveType", typeName: "undefined" } as PrimitiveType,
        ],
      } as Union,
    ],
  };
  t.pass();
});
