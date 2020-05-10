import { types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import {
  IR,
  Union,
  PropertySignature,
  IndexSignatureKeyType,
  IndexSignature,
  ObjectPattern,
  BuiltinTypeName,
  builtinTypes,
  BuiltinType,
} from "./typeIR";
import { Errors, createErrorThrower } from "../macro-assertions";

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

const throwMaybeAstError: (message: string) => never = createErrorThrower(
  generateTypeIR.name,
  Errors.MaybeAstError
);

const throwUnexpectedError: (message: string) => never = createErrorThrower(
  generateTypeIR.name,
  Errors.UnexpectedError
);

function assertTypeAnnotation(
  node: t.TSTypeAnnotation | null
): asserts node is t.TSTypeAnnotation {
  if (node === null) {
    throwMaybeAstError(`type annotation was null`);
  }
}

// https://github.com/microsoft/TypeScript/issues/38447
function assertBuiltinType(type: string): asserts type is BuiltinTypeName {
  if (!builtinTypes.includes(type as BuiltinTypeName)) {
    throwUnexpectedError(`${type} is not a builtin type`);
  }
}

export default function generateTypeIR(node: t.TSType): IR {
  debugger;
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
    // TODO: This or is probably not ok because a TypeLiteral cannot have generics from the parent
    // but a literal type can
    // TODO: Interfaces are just named type literals and type literals
    // are just named interfaces
    // we can normalize both and use the same code to parse both

    // The above is incorrect -- interfaces can have generics

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
        // keys cannot be optional in index types and key names don't matter
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
          assertTypeAnnotation(member.typeAnnotation);
          indexSignatures[keyType] = {
            type: "indexSignature",
            keyType,
            value: generateTypeIR(member.typeAnnotation.typeAnnotation),
          };
        } else {
          throwMaybeAstError(
            `keyTypeAnnotation had unexpected value: ${keyTypeAnnotation}`
          );
        }
      } else if (t.isTSPropertySignature(member)) {
        const { key } = member;
        if (t.isIdentifier(key)) {
          const keyName = key.name;
          if (typeof keyName === "string" || typeof keyName === "number") {
            const optional = Boolean(member.optional);
            assertTypeAnnotation(member.typeAnnotation);
            propertySignatures.push({
              type: "propertySignature",
              keyName,
              optional,
              value: generateTypeIR(member.typeAnnotation.typeAnnotation),
            });
          } else {
            throwMaybeAstError(
              `property signature key ${keyName} had unexpected type ${typeof keyName}`
            );
          }
        } else {
          throwMaybeAstError(
            `property signature had unexpected key type: ${key.type}`
          );
        }
      } else if (t.isTSMethodSignature(member)) {
        // TODO: Have switch that supports method signatures as functions (without type args)
        throw new MacroError(
          `Method signatures in interfaces and type literals are not supported`
        );
      } else {
        throwUnexpectedError(`unexpected signature type: ${member.type}`);
      }
    }
    const [n, s] = [indexSignatures.number, indexSignatures.string];
    const objectPattern: ObjectPattern = {
      type: "objectPattern",
      properties: propertySignatures,
      ...(n && { numberIndexer: n }),
      ...(s && { stringIndexer: s }),
    };
    return objectPattern;
  } else if (
    t.isTSNumberKeyword(node) ||
    t.isTSStringKeyword(node) ||
    t.isTSBooleanKeyword(node) ||
    t.isTSObjectKeyword(node) ||
    t.isTSNullKeyword(node) ||
    t.isTSUndefinedKeyword(node) ||
    t.isTSAnyKeyword(node) ||
    t.isTSUnknownKeyword(node)
  ) {
    const { type } = node;
    // type is "TSNumberKeyword", "TSStringKeyword", etc.
    const builtinTypeName = type
      .slice("TS".length, -"Keyword".length)
      .toLowerCase();
    assertBuiltinType(builtinTypeName);
    const builtinType: BuiltinType = {
      type: "type",
      typeName: builtinTypeName,
    };
    return builtinType;
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
  value2: 3;
  value3: never;
  value4: { [key: string]: number };
}

interface qux {
  value: BigInt;
}

let test: qux = { value: BigInt(3), value2: ["hello", "world"] };

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
