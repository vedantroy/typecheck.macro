import { types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import {
  IR,
  Union,
  PropertySignature,
  IndexSignatureKeyType,
  IndexSignature,
  ObjectPattern,
} from "./typeIR";
import { Errors, createErrorThrower } from "../macro-assertions";

// TODO: File issue in Typescript compiler. See if this can be builtin.
function hasAtLeast2Elements<T>(array: T[]): array is [T, T, ...T[]] {
  return array.length >= 2;
}

/**
 * Code is written in a shuttle style. Example:
 * if (cond) {
 *    return value
 * } else {
 *   throw Error(...)
 * }
 * 
 * Here, the else statement is not needed, but we keep it.
 * Otherwise, we have the following scenario:
 * if (cond) {
 *    if (cond2) return value
 *    // whoops forgot to handle case when cond2 is false!
 * }
 * // now we falsely throw this error instead
 * throw Error(...)
 */
export default function generateTypeIR(node: t.TSType): IR {
  const throwMaybeAstError: (message: string) => never = createErrorThrower(
    generateTypeIR.name,
    Errors.MaybeAstError
  );

  const throwUnexpectedError: (message: string) => never = createErrorThrower(
    generateTypeIR.name,
    Errors.UnexpectedError
  );

  if (t.isTSUnionType(node)) {
    const children: IR[] = [];
    for (const childType of node.types) {
      children.push(generateTypeIR(childType));
    }
    if (hasAtLeast2Elements(children)) {
      // Have an unnecessary variable over return {...} as Union
      // because the latter gives worse type checking
      const union: Union = { type: "union", childTypes: children };
      return union;
    }
    throwMaybeAstError(`union type had ${children.length}`);
  } else if (t.isTSTypeLiteral(node)) {
    // TODO: Interfaces are just named type literals and type literals
    // are just named interfaces
    // we can normalize both and use the same code to parse both

    // https://stackoverflow.com/questions/53276792/define-a-list-of-optional-keys-for-typescript-record
    type PartialRecord<K extends keyof any, T> = {
      [P in K]?: T;
    };
    const indexSignatures: PartialRecord<
      IndexSignatureKeyType,
      IndexSignature
    > = {};
    const propertySignatures: PropertySignature[] = [];
    for (const member of node.members) {
      // we only encounter Index, Property, and Method signatures inside an object
      // pattern or interface, so just handle them here
      if (t.isTSIndexSignature(member)) {
        //                 ˅˅˅˅˅˅˅ is value type annotation (value)
        // {[key: string]: number}
        //   ˄˄˄˄˄˄˄˄˄˄˄˄  is key type annotation (key)
        // The only valid keys are "string" and "number" and
        // keys cannot be optional in index types
        // hence index signature keys are specially handled here.
        // Otherwise, I would extract the code to handle type annotations for
        // PropertySignature and IndexSignature into a single method

        const keyTypeAnnotation = member.parameters[0]?.typeAnnotation;
        if (t.isTSTypeAnnotation(keyTypeAnnotation)) {
          const indexType = keyTypeAnnotation.typeAnnotation.type;
          let keyType: IndexSignatureKeyType;
          switch (indexType) {
            case "TSNumberKeyword":
              keyType = "number";
              break;
            case "TSStringKeyword":
              keyType = "string";
              break;
            default:
              throwMaybeAstError(
                `indexType had an unexpected value: ${indexType}`
              );
          }
          if (member.typeAnnotation !== null) {
            indexSignatures[keyType] = {
              type: "indexSignature",
              keyType,
              value: generateTypeIR(member.typeAnnotation.typeAnnotation),
            };
          } else {
            throwMaybeAstError(`member.typeAnnotation was null`);
          }
        } else {
          throwMaybeAstError(`keyTypeAnnotation had unexpected value: ${keyTypeAnnotation}`)
        } 
      } else if (t.isTSPropertySignature(member)) {
        // TODO
      }
    }
    const objectPattern: ObjectPattern = {
      type: "object",
      properties: propertySignatures,
      numberIndexer: indexSignatures['number'],
      stringIndexer: indexSignatures['string']
    }
    return objectPattern;
  } else if (t.isTSIntersectionType(node) || t.isTSMappedType(node)) {
    throw new MacroError(
      `${node.type} types are not supported. File an issue with the developer.`
    );
  } else {
    throwUnexpectedError(`${node.type} was not expected`);
  }
}

// Example:

interface bar {
  value2: number;
  value3: never;
}

let zumba: bar = { value2: 3 };

type foobar = "hello" | "world";

type baz = { [key: string]: number } | ("Hello" | bar);

interface foo {
  value: string;
  barValue?: bar;
  arr: [baz?, bar?, ...number[]];
}

const bazSchema = {
  type: "union",
  childTypes: [
    {
      type: "object",
      patternProps: [
        { type: "patternProp", keyType: "string", value: { type: "number" } },
      ],
      props: [],
    },
    {
      type: "parenthesisType",
      childType: [
        {
          type: "union",
          childTypes: [{ type: "literal", value: "Hello" }, { type: "$bar" }],
        },
      ],
    },
  ],
};

const barSchema = {
  type: "interface",
  props: [{ name: "value2", type: "number", optional: false }],
};

const fooSchema = {
  type: "interface",
  optional: false,
  props: [
    { name: "value", type: "string", optional: false },
    { name: "barValue", type: "$bar", optional: true },
    {
      name: "arr",
      type: "tuple",
      optional: false,
      children: [
        { type: "$baz", optional: true },
        { type: "$bar" },
        { metaType: "rest", type: "number" },
      ],
    },
  ],
};
