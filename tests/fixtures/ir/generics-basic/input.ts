import createValidator, {
  __dumpAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  interface Foo<T> {
    val: T;
  }
  register("Foo");
  createValidator<Foo<string>>();
  return __dumpAllIR;
};
