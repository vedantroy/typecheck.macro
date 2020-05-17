const fse = require("fs-extra");
const path = require("path");
const argv = require("minimist")(process.argv.slice(2));
require("../_register");
const dataDir = path.join(__dirname, "generated");

const toTest = argv._[0];
const libNames = {
  macro: "macro",
  runtypes: "runtypes",
  "io-ts": "io-ts",
  ajv: "ajv",
  zod: "zod",
};

if (!Object.keys(libNames).includes(toTest)) {
  throw Error(`Unrecognized library: ${toTest}`);
}

const validatorsDir = path.join(__dirname, "validators");

const results = {};

function getValidator(testName, toTest) {
  return require(path.join(validatorsDir, testName, `${libNames[toTest]}.ts`))
    .default;
}

function getData(testName) {
  return JSON.parse(fse.readFileSync(path.join(dataDir, `${testName}.json`)));
}

for (const testName of fse.readdirSync(validatorsDir)) {
  if (argv.only && argv.only !== testName) continue;
  // Want to keep all involved variables as close to the testing loop as possible
  const validate = getValidator(testName, toTest);
  const data = getData(testName);
  Object.freeze(data);
  const start = process.hrtime.bigint();
  for (let i = 0; i < data.length; ++i) {
    validate(data[i]);
  }
  const finish = process.hrtime.bigint();
  // no information is lost in converting the average to a number
  // (unless the average validation time was insanely high)
  const average = Number((finish - start) / BigInt(data.length));
  results[testName] = average;

  if (argv.validate) {
    const macroValidator = getValidator(testName, libNames.macro);
    for (let i = 0; i < data.length; ++i) {
      const macroVal = macroValidator(data[i]);
      let otherVal;
      switch (toTest) {
        case libNames.ajv:
          otherVal = validate(data[i]);
          break;
        default:
          throw Error(`${toTest} does not support --validate`);
      }
      if (macroVal !== otherVal) {
        console.log(macroValidator.toString());
        throw Error(
          `For object ${JSON.stringify(
            data[i]
          )} the macro and ${toTest} returned ${macroVal} and ${otherVal} respectively`
        );
      }
    }
  }
}

const resultsDir = path.join(__dirname, "results");
const statsFile = `${toTest}.json`;
const statsFilePath = path.join(resultsDir, statsFile);
let stats = {};
if (fse.pathExistsSync(statsFilePath)) {
  stats = JSON.parse(fse.readFileSync(statsFilePath));
}

for (const [testName, result] of Object.entries(results)) {
  if (!stats[testName]) stats[testName] = { avgs: [], avgOfAvgs: null };
  const avgs = stats[testName].avgs;
  avgs.push(result);
  const sum = avgs.reduce((sumSoFar, curVal) => sumSoFar + curVal);
  stats[testName].avgOfAvgs = Math.floor(sum / avgs.length);
}

fse.outputFileSync(statsFilePath, JSON.stringify(stats, null, 2));
