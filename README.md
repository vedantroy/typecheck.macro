typecheck.macro
===
[![Babel Macro](https://img.shields.io/badge/babel--macro-%F0%9F%8E%A3-f5da55.svg?style=flat-square)](https://github.com/kentcdodds/babel-plugin-macros)

> Automatically generate blazing fast 🔥🔥 validators for Typescript types.

# Simple Example

```typescript
type Cat<T> = {
    breed: "tabby" | "siamese";
    isNice: boolean;
    trinket?: T;
}
register('Cat')
const isNumberCat = createValidator<Cat<number>>()
isNumberCat({ breed: "tabby", isNice: false })                 // true
isNumberCat({ breed: "corgi", isNice: true, trinket: "toy" })  // false
```

# Why?

## Ease of Use
With typecheck.macro you can write normal Typescript types and automatically get validation functions for them. Other validation libraries require you to write your types in a [DSL](https://en.wikipedia.org/wiki/Domain-specific_language).

typecheck.macro supports interfaces, generics, tuples, unions, index signatures, optional properties, and more so you can write types naturally.

## Performance
typecheck.macro generates specialized validation functions for each type that are pure Javascript. Almost every other library generates generic data structures that are plugged into a generic validator function.

typecheck.macro is up to 3x faster than [ajv](https://github.com/ajv-validator/ajv), the fastest JSON schema validator. And anywhere from 6 to 500 times faster than popular libraries, like [runtypes](https://github.com/pelotom/runtypes) or [zod](https://github.com/vriad/zod).

*All comparisons are friendly in nature*

# Installation
If you are using [Gatsby](https://github.com/gatsbyjs/gatsby) or [Create React App](https://github.com/facebook/create-react-app), you can just install the macro. No other steps needed!

Otherwise, you will need to switch over to compiling your Typescript with Babel. This isn't difficult since Babel has good Typescript support. See [the example](example/).

Then install `babel-plugin-macros` and add it to your babel config.

Finally, `npm install typecheck.macro`

# Usage
# Support Table

# Performance Table