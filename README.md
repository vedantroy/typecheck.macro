typecheck.macro
===
[![Babel Macro](https://img.shields.io/badge/babel--macro-%F0%9F%8E%A3-f5da55.svg?style=flat-square)](https://github.com/kentcdodds/babel-plugin-macros)

> Automatically generate 🔥blazing🔥 fast validators for Typescript types.

*This project is in beta but it has been tested against established libraries, like [ajv](https://github.com/ajv-validator/ajv), to ensure it is reliable and doesn't make mistakes.*

# Example

```typescript
type Cat<T> = {
    breed: "tabby" | "siamese";
    isNice: boolean;
    trinket?: T;
}
registerType('Cat')
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

# Installation
If you are using [Gatsby](https://github.com/gatsbyjs/gatsby) or [Create React App](https://github.com/facebook/create-react-app), you can just install the macro. No other steps needed! (*Most likely, I haven't tried it personally, so let me know what happens!*)

Otherwise, you will need to switch over to compiling your Typescript with Babel. This isn't difficult since Babel has good Typescript support. See [the example](example/).

Then install `babel-plugin-macros` and add it to your babel config.

Finally, `npm install typecheck.macro`

*Let me know if you have any installation issues, I will respond.*

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

### `createValidator<T>(opts?: {circularRefs?: boolean}): (value: unknown) => value is T`
Creates a validator function for the type `T`.

`T` can be any valid Typescript type/type expression that is supported by the macro.

At compile time, the call to `createValidator` will be replaced with the generated code.

### `createDetailedValidator<T>(opts?: {circularRefs?: boolean, expectedValueAsIR?: boolean})`

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
// errors = [["input", 42, "type: string"]]
```

The resulting validation function takes 2 parameters:
- `value`, the value you want to validate
- `errs`, an array which will be populated with all the validation errors (if there are any). Each entry in `errs` is a tuple of 3 elements:
    - the path in the object at which validation failed (`string`)
    - the value at that path (`any`)
    - the expected value at that path (`string` by default, `IR` if `expectedValueAsIR` is `true`)

If `expectedValueAsIR` is true, then the expected value will be a JSON object that is typecheck.macro's internal representation of the expected type at the place where validation failed. You should generally not use this option because the macro's internal representation is unstable and not bound by semver.

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
| Map           | WIP     |                           |
| ReadonlyMap   | WIP     | Same as Map at runtime.   |
| Record        | WIP     |                           |

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
| classes                      | No      |                                    |

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

[WIP]

Generate data with `pnpm run bench:prep -- [simple|complex|complex2]` and run a benchmark with `pnpm run bench -- [macro|ajv|io-ts|runtypes|zod] --test=[simple|complex|complex2]`

# Caveats
- typecheck.macro currently allows extra keys to pass validation. This is consistent with the behavior of type aliases in Typescript, but different from the behavior of interfaces. Disallowing extra keys is a WIP feature.
- typecheck.macro does not handle multi-file types. E.g if `Foo` imports `Bar` from another file, typecheck cannot generate a validator for it. registerType is *file scoped*.
    - If this is a significant problem, file a Github issue so I increase the priority of creating a CLI tool that can handle multi-file types.
- typecheck.macro can intersect intersection types and intersection types with circular properties, but the following case is WIP: `type Foo = {next: Foo} & {next : string}`. In other words, you shouldn't intersect a circular property (like `next`) with another property. However, `type Foo = {next: Foo} & {data: string}` is totally fine.

# Contributing
Read the [contributor docs](CONTRIBUTING.md). Contributions are welcome and encouraged!