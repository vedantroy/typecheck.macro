import createValidator, {
  __dumpAllIR,
  register,
} from "../../../../dist/typecheck.macro";
/**
 * instantiated generics are stored properly
 */

export default () => {
  type T<A> = {
    val: A;
  };
  register("T");
  createValidator<T<string>>();
  createValidator<T<number>>();
  return __dumpAllIR;
};
