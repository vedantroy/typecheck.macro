import createValidator, {
  createDetailedValidator,
  register,
} from "../../dist/typecheck.macro";
import test from "ava";

test("nested-index-sigs", (t) => {
  interface Zorg {
    [key: string]: { [key: string]: number };
  }
  register("Zorg");
  const x = createDetailedValidator<Zorg>();
  const errs = [];
  t.false(x({ a: { b: "eggplant" } }, errs));
  t.deepEqual(errs, [
    [
      `input["a"]["b"]`,
      "eggplant",
      { type: "primitiveType", typeName: "number" },
    ],
  ]);
});
