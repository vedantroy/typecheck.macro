import { isRight } from "fp-ts/lib/Either";
import * as t from "io-ts";

const T = t.type({
  legs: t.number,
  pet: t.type({
    name: t.string,
    attributes: t.tuple([t.string, t.number, t.union([t.string, t.number])]),
  }),
  meaning: t.literal(42),
  friend: t.type({
    name: t.union([t.string, t.number]),
    relationship: t.union([t.literal("Happy"), t.literal("Sad")]),
  }),
});

export default (x) => isRight(T.decode(x));
