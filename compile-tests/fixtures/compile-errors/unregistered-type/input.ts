import createValidator from "../../../../dist/typecheck.macro";

interface Foo<T> {}
createValidator<Foo<string>>();
