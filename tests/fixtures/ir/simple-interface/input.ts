import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface Simple {
    a: number;
    b: string;
  }
  register("Simple");
  return __dumpAllIR;
};
