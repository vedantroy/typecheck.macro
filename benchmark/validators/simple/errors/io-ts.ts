import { isRight } from "fp-ts/lib/Either";
import * as t from "io-ts";

const T = t.type({
  isCat: t.boolean,
  legs: t.number,
});

export default (x) => isRight(T.decode(x));
