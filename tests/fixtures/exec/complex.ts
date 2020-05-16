import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const complexV = createValidator<
    | null
    | number
    | {
        a?: [
          number | "foo" | false | { a: [number, Array<number | string>] },
          number?,
          ...string[]
        ];
        b: "bar" | false;
        [key: number]: string;
      }
  >();
  tBV(t, complexV, {
    inputs: [
      null,
      3,
      NaN,
      { b: "bar" },
      { b: false },
      { a: [false], b: false },
      { a: undefined, b: "bar", 3: "Foo" },
      { a: [42, undefined, "h", "w"], b: false },
      { a: [{ a: [4, []] }, 3, "h", "w"], b: false },
      { a: [{ a: [4, ["hello", 3]] }, 3, "h", "w"], b: false },
    ],
    returns: true,
  });

  tBV(t, complexV, {
    inputs: [undefined],
    returns: false,
  });
};
