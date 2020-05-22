import createValidator, { register } from "../../../../dist/typecheck.macro";

interface Foo<T> {}
createValidator<Foo<string>>();
