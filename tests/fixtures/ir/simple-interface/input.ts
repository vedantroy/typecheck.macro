import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

export default () => {
  interface Simple {
    a: number;
    b: string;
  }
  register("Simple");
  return __dumpAllIR;
};
