import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

/**
 * 1. index signatures work/are registered individually
 * 2. literal keys are the same as non-literal keys
 * 3. optional parameters work
 * 4. nested object patterns work
 */

export default () => {
  type T = {
    literal: string;
    opt?: number;
    nested: { foo?: number };
    [key: string]: string | number | any;
    [key: number]: number;
  };
  register("T");
  return __dumpAllIR;
};
