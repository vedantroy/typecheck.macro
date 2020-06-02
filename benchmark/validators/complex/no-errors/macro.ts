import createValidator from "../../../../dist/typecheck.macro";

export default createValidator<
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
>();
