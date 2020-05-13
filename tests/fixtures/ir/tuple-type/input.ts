import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface foo {}
  type Empty = [];
  type NoOptional = [string, foo];
  type Optional = [string, foo?, foo?];
  type Rest1 = [foo, ...Array<number>];
  type Rest2 = [foo, ...ReadonlyArray<number>];
  type Rest3 = [foo, ...number[]];
  type Complex = [foo | number, number?, "hello"?, 3?, ...Array<number>];
  register("Empty");
  register("NoOptional");
  register("Optional");
  register("Rest1");
  register("Rest2");
  register("Rest3");
  register("Complex");
  return __dumpAllIR;
};
