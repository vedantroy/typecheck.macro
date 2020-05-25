import { IR, Union, PrimitiveTypeName } from "../IR";
import { traverse, getInstantiatedType } from "./utils";
import { isUnion, isFailedIntersection, isAnyOrUnknown } from "../IRUtils";
import { flatten } from "./flatten";
import {
  throwMaybeAstError,
  throwUnexpectedError,
} from "../../macro-assertions";
import { oneLine } from "common-tags";
import * as u from "../IRUtils";
import { TypeInfo } from "./instantiate";
import { hasAtLeast2Elements } from "../../utils/checks";

function cleanUnion(
  union: Union,
  instantiatedTypes: Map<string, TypeInfo>
): IR {
  let childTypes: IR[] = union.childTypes;
  childTypes = childTypes.filter((t) => !isFailedIntersection(t));
  if (childTypes.length === 0) {
    // TODO: Convert this to formal error
    throwMaybeAstError(oneLine`union had 0 child types after stripping failed intersections. 
        You probably have an invalid intersection in your code.`);
  }
  const primitives = new Set<PrimitiveTypeName>();

  function hasSubsumingPrimitive(x: IR): boolean {
    if (u.isInstantiatedType(x)) {
      x = getInstantiatedType(x.typeName, instantiatedTypes);
    }
    if (u.isLiteral(x) && primitives.has(typeof x.value as PrimitiveTypeName)) {
      return true;
    } else if (u.isObjectPattern(x) && primitives.has("object")) {
      return true;
    }
    return false;
  }

  const notPrimitives: IR[] = [];

  for (let type of childTypes) {
    if (u.isInstantiatedType(type)) {
      const instantiated = getInstantiatedType(
        type.typeName,
        instantiatedTypes
      );
      if (u.isPrimitive(instantiated)) {
        type = instantiated;
      }
    }
    if (isAnyOrUnknown(type)) {
      return u.PrimitiveType("any");
    }
    if (u.isPrimitive(type)) {
      primitives.add(type.typeName);
    } else {
      notPrimitives.push(type);
    }
  }
  childTypes = notPrimitives.filter((t) => !hasSubsumingPrimitive(t));
  for (const typeName of primitives) {
    childTypes.push(u.PrimitiveType(typeName));
  }
  if (childTypes.length === 1) {
    return childTypes[0];
  }
  hasAtLeast2Elements(childTypes);
  return u.Union(childTypes[0], childTypes[1], ...childTypes.slice(2));
}

function cleanUnions(ir: IR, instantiatedTypes: Map<string, TypeInfo>): IR {
  return traverse<Union>(ir, isUnion, (cur) => {
    return cleanUnion(cur, instantiatedTypes);
  });
}

export default cleanUnions;
