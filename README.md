typecheck.macro
===
[![Babel Macro](https://img.shields.io/badge/babel--macro-%F0%9F%8E%A3-f5da55.svg?style=flat-square)](https://github.com/kentcdodds/babel-plugin-macros)

> Automatically generate 🔥blazing fast🔥 validators for Typescript types. [npm link](https://www.npmjs.com/package/typecheck.macro)

# Example

```typescript
type Cat<T> = {
    breed: "tabby" | "siamese";
    isNice: boolean
    trinket?: T;
}
registerType('Cat')
// You can also use createDetailedValidator to get error messages
const isNumberCat = createValidator<Cat<number>>()
isNumberCat({ breed: "tabby", isNice: false })                 // true
isNumberCat({ breed: "corgi", isNice: true, trinket: "toy" })  // false
```

# Purpose

Because Typescript types are erased at compile time you can't use them to validate data at runtime. For example, you might want to ensure an API is returning data that matches a given type at runtime. This library (macro) generates validation functions for your Typescript types at compile time.

# Why this library/macro?

## Ease of Use
With typecheck.macro you can write normal Typescript types and automatically get validation functions for them. Other validation libraries require you to write your types in a [DSL](https://en.wikipedia.org/wiki/Domain-specific_language). Thus, typecheck.macro naturally integrates into your project without requiring you to change any existing code.

typecheck.macro supports a large portion of the Typescript type system ([support table](#support-tables)) so you can validate most of your existing types automatically.

typecheck.macro has features, such as comprehensive error messages and automatic detection and support of circular types, that other projects do not have.

## Performance
typecheck.macro generates specialized validation functions that are pure Javascript at compile time.
(Almost) every other library generates generic data structures that are plugged into a generic validator function.

typecheck.macro is up to 3x faster than [ajv](https://github.com/ajv-validator/ajv), the fastest JSON schema validator. And anywhere from 6 to 500 times faster than popular libraries, like [runtypes](https://github.com/pelotom/runtypes) or [zod](https://github.com/vriad/zod).

*All comparisons are friendly in nature*

typecheck.macro is **smart**. It will analyze your type and determine the fastest/most minimal validation function that can validate your type. For example, the type `"Hello" | string` will automatically be simplified to `string` and the type `A` in `type A = B | number; type B = string | C; type C = string` will automatically be simplified to `type A = string | number`, and the appropriate validation code will be generated.

# Installation
If you are using [Gatsby](https://github.com/gatsbyjs/gatsby) or [Create React App](https://github.com/facebook/create-react-app), you can just install the macro. No other steps needed! 

Otherwise, you will need to switch over to compiling your Typescript with Babel. This isn't difficult since Babel has good Typescript support. See [the example](example/).

## Step by Step Instructions
1. Install dependencies for compiling Typescript with Babel and using macros. `[pnpm|npm|yarn] install --save-dev @babel/core @babel/cli @babel/preset-typescript @babel/plugin-transform-modules-commonjs babel-plugin-macros typecheck.macro`
    - `@babel/plugin-transform-modules-commonjs` is so `export` and `import` are turned into `module.exports` and `require`, so your code will work in Node.
2. Add the file `babel.config.json` to the root of your project with the contents:
```json
{
  "presets": ["@babel/preset-typescript"],
  "plugins": ["babel-plugin-macros", "@babel/plugin-transform-modules-commonjs"]
}
```
3. Add the command `babel src --out-dir dist --extensions \".ts\"` to your "package.json". All typescript files in "src" will be compiled (with the macro enabled) to the dist directory.

# Usage
## Basic Usage
*In addition to reading this, read [the example](example/).*

```typescript
import createValidator, { registerType } from 'typecheck.macro'

type A = {index: number, name: string}
registerType('A')
// named type
const validator = createValidator<A>()
// anonymous type
const validator2 = createValidator<{index: number, name: string}>()
// mix and match (anonymous type that contains a named type)
const validator3 = createValidator<{index: number, value: A}>()
```
---

### `registerType(typeName: string)`
If you want to validate a named type or an anonymous type that references a named type, you must register the named type.

`typeName` is the name of the type you want to register. The type declaration must be in the same scope of the call to `registerType`.

```typescript
{
    type A = {val: string}
    registerType('A') // registers A
    {
        registerType('A') // does nothing :(
    }
}
registerType('A') // does nothing :(
```

All registered types are stored in a per-file global namespace. This means any types you want to register in the same file should have different names.

registering a type in one file will not allow it to be accessible in another file. This means you cannot generate validators for multi-file types
(a type that references a type imported from another file). If this is a big issue for you, go to the "Caveats" section.

A work-around for supporting multi-file types is to move your multi-file types into one file (so they are no longer multi-file types). Then generate the validation
functions in that file and export to them where you want to use them. This works because validation functions are just normal Javascript!

`registerType` automatically registers **all** types in the same scope as the original type it is registering that are referred to by the original type.

```typescript
type A = {val: string}
type B = {val: A}
type C = {val: A}
// registers A and B, but not C, since B only refers to A.
registerType('B')
```
All instances of the `registerType` macro are evaluated before any instance of `createValidator`. So ordering doesn't matter.

Most of the primitive types (`string`, `number`, etc.) are already registered for you. As are `Array`, `Map`, `Set` and their readonly equivalents.

### `createValidator<T>(opts?: BooleanOptions, userFuncs?: UserFunctions): (value: unknown) => value is T`
Creates a validator function for the type `T`.

`T` can be any valid Typescript type/type expression that is supported by the macro.

At compile time, the call to `createValidator` will be replaced with the generated code.

#### BooleanOptions: `{circularRefs?: boolean, allowForeignKeys?: boolean}`
- `allowForeignKeys`
  - **Default**: `true`. 
  - If `false`, then any unexpected/extra keys in objects will throw a validation error. Note: If you are using a string index signature then there is no such thing as an extra key. And if you are using just a numeric index signature, then there is no such thing as an extra key with a numeric value. This is consistent with typescript.
- `circularRefs`
  - **Default**: `true`
  - If `false`, then any circular references in the object will result in an infinite-loop at runtime. Note: circular types, such as `type A = {next: A } | null` will still work if this option is set to `false`. However, true circular references (instead of just another layer of nesting) in an input object will not work.

### `createDetailedValidator<T>(opts?: DetailedOptions, userFuncs?: UserFunctions)`

Full type signature:
```typescript
function createDetailedValidator<T>(
  opts?: DetailedOptions
): (
  value: unknown,
  errs: Array<[string, unknown, IR.IR | string]>
) => value is T;
```

Creates a detailed validator function for the type `T`. Example usage:

```typescript
const v = createDetailedValidator<{x: string}>()
const errs = []
const result = v({x: 42}, errs) // result is false
// errors = [["input["x"]", 42, "type: string"]]
```

The resulting validation function takes 2 parameters:
- `value`, the value you want to validate
- `errs`, an array which will be populated with all the validation errors (if there are any). Each entry in `errs` is a tuple of 3 elements:
    - the path in the object at which validation failed (`string`)
    - the value at that path (`any`)
    - the expected value at that path

#### DetailedOptions: `BooleanOptions & { expectedValueFormat: string }`
- `expectedValueFormat`
  - **Default**: `"human-friendly"`
  - If `"human-friendly"` then the expected value format will be a human friendly description of the types.
  - If `"type-ir"` then the expected value will be a JSON object representing the macro's internal representation of the expected type. It is not recommended to use this option because the internal representation is unstable and not bound by semver.

## Constraints

What if you want to enforce arbitrary constraints at runtime? For example, ensure a number in an interface is always positive. You can do this with constraints. You can enforce an arbitary runtime constraint for any user-defined type (e.g not `number`, `string`, etc.).

The type of the 2nd parameter of both `createValidator` and `createDetailedValidator`:

```typescript
type UserFunction = { constraints: { [typeName: string]: Function } }
```

### Context
```typescript
type NumberContainer = {
  pos: Positive;
}
type Positive = number;
```

### With Boolean Validation

```typescript
const x = createValidator<NumberContainer>(undefined, {
  constraints: {
    Positive: x => x > 0
  }
})
```

Notes: 
- The `Positive` key in the `constraints` object corresponds to the user-defined type `Positive`. 
- The value must be a function expression. It cannot be a variable that refers to a function because the macro is evaluated at compile time.
- The constraint is only called after its base type has been validated. In this instance, the "Positive" constraint will only be called after `input.pos` is validated to be a number. 

### With Detailed Validation

```typescript
const x = createDetailedValidator<NumberContainer>(undefined, {
  constraints: {
    Positive: x => x > 0 ? null : "expected a positive number"
  }
})
```

Note: The constraint function returns an error (if there is one). Otherwise it returns a falsy value. Any truthy value will be treated as an error message/object.

# Support Tables

*See [the exec tests](tests/) to get a good idea of what is supported*

## Primitives Types
| Primitives | Support |
|------------|---------|
| number     | Yes     |
| string     | Yes     |
| boolean    | Yes     |
| object     | Yes     |
| any        | Yes     |
| unknown    | Yes     |
| BigInt     | WIP     |
| Symbol     | WIP     |

## Builtin Generic Types
| Type          | Support | Notes                     |
|---------------|---------|---------------------------|
| Array         | Yes     |                           |
| ReadonlyArray | Yes     | Same as Array at runtime. |
| Map           | Yes     |                           |
| ReadonlyMap   | Yes     | Same as Map at runtime.   |
| Set           | Yes     |                           |
| ReadonlySet   | Yes     | Same as Set at runtime.   |

## Typescript Concepts
| Language Features            | Support | Notes                              |
|------------------------------|---------|------------------------------------|
| interface                    | Yes     | extending another interface is WIP |
| type alias                   | Yes     |                                    |
| generics                     | Yes     |                                    |
| union types                  | Yes     |                                    |
| tuple types                  | Yes     |                                    |
| arrays                       | Yes     |                                    |
| index signatures             | Yes     |                                    |
| literal types                | Yes     |                                    |
| circular references          | Yes     |                                    |
| parenthesis type expressions | Yes     |                                    |
| intersection types           | Yes     | One caveat  ([caveats](#caveats))  |
| Mapped Types                 | WIP     |                                    |
| Multi-file types             | iffy    | Requires CLI tool instead of macro |
| User-declared classes        | No      |                                    |

# Performance Table

Notes: 
- The numbers are nanoseconds.
- ajv is the current fastest JSON schema validator

## Boolean Validator
| Library         | Simple | Complex | Notes                                                                              |
|-----------------|--------|---------|------------------------------------------------------------------------------------|
| typecheck.macro | 46     | 105     |                                                                                    |
| ajv             | 108    | 331     |                                                                                    |
| io-ts           | 235    |         |                                                                                    |
| runtypes        | 357    |         |                                                                                    |
| zod             | 11471  |         | zod throws an exception upon validation error, which resulted in this extreme case |

## Error Message Validator
Note: Out of all libraries, typecheck.macro has the most comprehensive error messages!

[Benchmarking is WIP]

Generate data with `pnpm run bench:prep -- [simple|complex|complex2]` and run a benchmark with `pnpm run bench -- [macro|ajv|io-ts|runtypes|zod] --test=[simple|complex|complex2]`

# Caveats
- typecheck.macro does not handle multi-file types. E.g if `Foo` imports `Bar` from another file, typecheck cannot generate a validator for it. registerType is *file scoped*.
    - If this is a significant problem, file a Github issue so I increase the priority of creating a CLI tool that can handle multi-file types.
- typecheck.macro can intersect intersection types and intersection types with circular properties, but the following case is WIP: `type Foo = {next: Foo} & {next : string}`. In other words, you shouldn't intersect a circular property (like `next`) with another property. However, `type Foo = {next: Foo} & {data: string}` is totally fine.

# Contributing
Read the [contributor docs](CONTRIBUTING.md). Contributions are welcome and encouraged!