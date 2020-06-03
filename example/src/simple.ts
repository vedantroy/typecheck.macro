import createValidator, { registerType } from "typecheck.macro";

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
 * registerType is another compile time macro. If you want to use a named type
 * as a type parameter to createValidator, you must register it.
 *
 * All usages of registerType are evaluated before any usage of createValidator.
 * (This works b/c compile time macros are evaluated by the compiler,
 * and not the JS runtime).
 *
 * registerType can be called anywhere in the same scope as the type it is
 * registering.
 *
 * registerType is *file-scoped*. This means once you register a type,
 * you can call createValidator with that type, anywhere in that file.
 *
 * registerType does not work across files. If this is a big issue for you,
 * file a Github issue so I can prioritize work on a CLI tool that will
 * solve this problem.
 */

registerType("Cat");
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
 * Now you see why registerType accepts a string instead of a type parameter.
 * "registerType<PetOwner>()" is not valid typescript!
 */

registerType("Dog");
registerType("PetOwner");

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

// a type you need runtime checks for
type ComplexType =
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
    };
registerType("ComplexType");
const isComplexType = createValidator<ComplexType>();
console.log(
  isComplexType({ a: [{ a: [4, ["hello", 3]] }, 3, "h", "w"], b: false })
);