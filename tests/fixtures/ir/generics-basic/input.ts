import createValidator, {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface Foo<T> {
    val: T
  }
  register("Foo");
  createValidator<Foo<string>>()
  return __dumpAllIR;
};