const { format } = require("prettier");
const fse = require("fs-extra");
const path = require("path");
const argv = require("minimist")(process.argv.slice(2));
require("../_register");
const dataDir = path.join(__dirname, "generated");

const ERRORS_FLAG = "errors";
const NO_ERRORS_FLAG = "no-errors";
const errors = argv[ERRORS_FLAG];
const noErrors = argv[NO_ERRORS_FLAG];

if (errors === noErrors) {
  throw new Error(
    `Exactly one of the flags: --${ERRORS_FLAG}, --${NO_ERRORS_FLAG} must be passed in`
  );
}

const errorsOption = errors ? ERRORS_FLAG : NO_ERRORS_FLAG;

const libToTest = argv._[0];
const libNames = {
  macro: "macro",
  runtypes: "runtypes",
  "io-ts": "io-ts",
  ajv: "ajv",
  zod: "zod",
};

if (!Object.keys(libNames).includes(libToTest)) {
  throw Error(`Unrecognized library: ${libToTest}`);
}

const TEST_NAME_FLAG = "test";
const testName = argv[TEST_NAME_FLAG];
if (testName === undefined) {
  throw new Error(`The flag --${TEST_NAME_FLAG}= must be specified`);
}

if (argv.validate) {
  if (errorsOption === NO_ERRORS_FLAG) {
    throw new Error(
      `--${NO_ERRORS_FLAG} does not support --validate because only typecheck.macro supports errorless (boolean-only) validation`
    );
  }
}

const validatorsDir = path.join(__dirname, "validators");

const results = {};

function getValidator() {
  const filePath = path.join(
    validatorsDir,
    testName,
    errorsOption,
    `${libNames[libToTest]}.ts`
  );
  return require(filePath).default;
}

function getData(testName) {
  return JSON.parse(fse.readFileSync(path.join(dataDir, `${testName}.json`)));
}

const data = getData(testName);
Object.freeze(data);
const validate = getValidator();
//console.log(format(validate.toString()))
console.log('starting...')
const start = process.hrtime.bigint();
for (let i = 0; i < data.length; ++i) {
  validate(data[i]);
}
const finish = process.hrtime.bigint();
console.log('finished!')

// no information is lost in converting the average to a number
// (unless the average validation time was insanely high)
const average = Number((finish - start) / BigInt(data.length));
results[testName] = average;

if (argv.validate) {
  const macroValidator = getValidator(testName, libNames.macro);
  for (let i = 0; i < data.length; ++i) {
    const macroVal = macroValidator(data[i]);
    let otherVal;
    switch (libToTest) {
      case libNames.ajv:
        otherVal = validate(data[i]);
        break;
      default:
        throw Error(`${libToTest} does not support --validate`);
    }
    if (macroVal !== otherVal) {
      throw Error(
        `For object ${JSON.stringify(
          data[i]
        )} the macro and ${libToTest} returned ${macroVal} and ${otherVal} respectively`
      );
    }
  }
}

const resultsDir = path.join(__dirname, "results");
const statsFile = `${libToTest}.${errorsOption}.json`;
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
