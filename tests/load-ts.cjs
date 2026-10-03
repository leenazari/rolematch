const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

exports.loadTs = function (relativePath, mocks = {}, transform = source => source) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const source = transform(fs.readFileSync(filename, "utf8"));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = compiledModule.require.bind(compiledModule);
  compiledModule.require = name => Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name);
  compiledModule._compile(compiled, filename);
  return compiledModule.exports;
};
