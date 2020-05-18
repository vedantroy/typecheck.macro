import createValidator, { register } from "typecheck.macro";
import { string } from "io-ts";

/**
 * createValidator is a compile time macro. Even though it looks like/
 * is called like a function, it isn't a function. At compile time,
 * all instances of createValidator are replaced with actual validator
 * functions.
 */
const isFruit = createValidator<{
  type: string;
  seeds?: boolean;
}>();

console.log(isFruit({ type: "banana" })); // true
console.log(isFruit({ type: "pomegranate", seeds: true })); // true

console.log(isFruit({ type: 42, seeds: true })); // false

type Cat = { name: string; breed: "bengal" | "persian" | "sphynx" | "siamese" };
/**
 * register is another compile time macro. If you want to use a named type
 * as a type parameter to createValidator, you must register it.
 *
 * All usages of register are evaluated before any usage of createValidator.
 * (This works b/c compile time macros are evaluated by the... compiler,
 * and not the JS runtime).
 *
 * register can be called anywhere in the same scope as the type it is
 * registering.
 */
register("Cat");
const isCat = createValidator<Cat>();

console.log(isCat({ name: "bob", breed: "bengal" }));
console.log(isCat({ name: "bart", breed: "golden retriever" }));

const isCatOwner = createValidator<{
  name: string;
  isNice: boolean;
  cat: Cat;
}>();

const cordelia: Cat = { name: "cordelia", breed: "sphynx" };
console.log(isCatOwner({ name: "rick", isNice: false, cat: cordelia })); // true
console.log(
  isCatOwner({
    name: "patrick",
    isNice: true,
    cat: { name: "harry", breed: "golden retriever" },
  })
); // false

interface Personality {
  isNice: boolean;
  numFriends: number;
}

interface PetOwner<Pet> {
  name: string;
  personality: Personality;
  pet: Pet;
}

/**
 * register will automatically register all types that are referenced
 * by the starting type that are in the same scope.
 *
 * Now you see why register accepts a string instead of a type parameter.
 * "register<PetOwner>" is not valid typescript
 */

register("Dog");
register("PetOwner");

type Dog = { name: string; wagsTail: boolean };
const isDogOwner = createValidator<PetOwner<Dog>>();

const owner = {
  name: "anthony",
  pet: { name: "bob", wagsTail: false },
  personality: { isNice: true, numFriends: 10 },
};

console.log(isDogOwner(owner)); // true
delete owner.pet.wagsTail;
console.log(isDogOwner(owner)); // false

// let's go crazy!
const isComplexType = createValidator<
  | null
  | number
  | {
      a?: [
        number | "foo" | false | { a: [number, Array<number | string>] },
        number?,
        ...string[]
      ];
      b: "bar" | false;
      [key: number]: string;
    }
>();

console.log(isComplexType({ a: [{ a: [4, ["hello", 3]] }, 3, "h", "w"], b: false })) // true

