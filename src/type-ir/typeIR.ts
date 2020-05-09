type Tag = "object" | "union" | "indexSignature" | "propertySignature";

export interface IR {
  type: Tag;
}

export interface Union extends IR {
  type: "union";
  childTypes: [IR, IR, ...IR[]];
}

export interface ObjectPattern extends IR {
  type: "object";
  numberIndexer?: IndexSignature;
  stringIndexer?: IndexSignature;
  properties: PropertySignature[];
}

// TODO: Might just be able to inline the type
const indexSignatureKeyTypes = ["string", "number"] as const;
export type IndexSignatureKeyType = typeof indexSignatureKeyTypes[number];

export interface IndexSignature extends IR {
  type: "indexSignature";
  // name doesn't matter in index signatures
  keyType: IndexSignatureKeyType;
  value: IR;
}

export interface PropertySignature extends IR {
  type: "propertySignature";
  // keyName encodes both name and value (string or number)
  keyName: string | number;
  optional: boolean;
  value: IR;
}
