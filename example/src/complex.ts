import createValidator, {
  registerType,
  createDetailedValidator,
} from "typecheck.macro";

// We can validate circular data
type LinkedList<T> = (T & { next: LinkedList<T> }) | null;
registerType("LinkedList");

interface Anime {
  name: string;
  rating: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
}
registerType("Anime");

const isAnimeLinkedList = createDetailedValidator<LinkedList<Anime>>();

const A: LinkedList<Anime> = { next: null, name: "Spirited Away", rating: 6 };
const B: LinkedList<Anime> = {
  next: null,
  name: "5 Centimeters per Second",
  rating: 5,
};
const C: LinkedList<Anime> = {
  next: null,
  name: "Ping Pong the Animation",
  rating: 10,
};
A.next = B;
B.next = C;
C.next = B;

let errs = [];
console.log(isAnimeLinkedList(A, errs)); // true
console.log(isAnimeLinkedList(B, errs)); // true
console.log(isAnimeLinkedList(C, errs)); // true

// @ts-ignore
B.name = 666;

// all are false because if a single node in a LinkedList is not valid
// then the entire LinkedList is not valid
console.log(isAnimeLinkedList(A, errs));
errs = [];
console.log(isAnimeLinkedList(B, errs));
errs = [];
console.log(isAnimeLinkedList(C, errs));
console.log(errs);

// Demonstration: error messages
// Pass in an array
// if there are errors, the array will be filled with tuples where
// the first entry is the "path" in the object where there was an error
// the 2nd entry is the actual value
// the 3rd entry is the expected value
// typecheck.macro doesn't stop validating after the first error, it tries
// to find all possible errors

interface GoodMusicArtist {
  name: "Lil Uzi Vert";
  albums: { [albumName: string]: string[] };
}
registerType("GoodMusicArtist");

const isGoodMusicArtist = createDetailedValidator<GoodMusicArtist>();
errs = [];
console.log(
  isGoodMusicArtist(
    {
      name: "Lil Uzi Vert",
      albums: { "Eternal Atake": ["Baby Pluto", "Lo Mein"] },
    },
    errs
  )
); // true

console.log(
  isGoodMusicArtist(
    {
      name: "Queen",
      albums: { "A Night at the Opera": ["Bohemian Rhapsody", 13] },
    },
    errs
  )
); // false
console.log(errs);

// In addition to arrays, the other native JS data structures are supported: Set and Map
interface SetAndMap {
  set: Set<number | Set<number>>;
  map: Map<Map<number, string>, string>;
}
registerType("SetAndMap");
const setAndMapValidator = createValidator<SetAndMap>();
const valid = {
  set: new Set([3, new Set([3])]),
  map: new Map([[new Map([[3, "hey"]]), ""]]),
};
const invalid = {
  set: new Set([3, new Set([3])]),
  map: new Map([[new Map([[3, 4]]), ""]]),
};
console.log(setAndMapValidator(valid)); // true
console.log(setAndMapValidator(invalid)); // false

// Disallow foreign keys
const noForeignKeysValidator = createDetailedValidator<{ a: number }>({
  allowForeignKeys: false,
});
errs = [];
noForeignKeysValidator({ a: 3, b: "uh oh" }, errs);
console.log(errs);

// Custom constraints
type PositiveNumber = number
type NegativeNumber = number
type NumberBox = {
  pos: PositiveNumber;
  neg: NegativeNumber;
}
registerType('NumberBox')

const constraintValidator = createValidator<NumberBox>(undefined, {
  constraints: {
    PositiveNumber: x => x > 0,
    NegativeNumber: x => x < 0
  }
})

console.log(constraintValidator({pos: 5, neg: -5})) // true
console.log(constraintValidator({pos: -5, neg: -5})) // false

// To see all the crazy things this library can do, check out the tests (particularly, the exec tests)
