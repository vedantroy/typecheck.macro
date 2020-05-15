import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

export default () => {
  interface IndexSignatures {
    [key: string]: string | number;
    [key: number]: number;
  }
  register("IndexSignatures");
  return __dumpAllIR;
};
