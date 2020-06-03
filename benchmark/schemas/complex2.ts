// The file the schemas for complex2 were generated from
type FakeAlien = {
  legs: number | string;
  pet: {
    name: string;
    attributes: [string, number?, (string | number | boolean)?];
  };
  meaning: 42 | 24;
  friend: {
    name: string | number;
    relationship: "Happy" | "Sad" | "Cordial";
  };
};

type Alien = {
  legs: number;
  pet: {
    name: string;
    attributes: [string, number, string | number];
  };
  meaning: 42;
  friend: {
    name: string | number;
    relationship: "Happy" | "Sad";
  };
};
