import { createDetailedValidator } from "../../../../dist/typecheck.macro";

export default (x) =>
  createDetailedValidator<
    | null
    | number
    | {
        a?: [
          number | { a: [number, Array<number | string>] },
          number,
          ...string[]
        ];
        b: "bar" | false | 42;
        c: Array<Array<number | boolean | "bar" | "zar">>;
      }
  >()(x, []);
