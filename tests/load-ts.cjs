const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

exports.loadTs = function (relativePath, mocks = {}, transform = source => source) {
  const cache = new Map();
  function compile(filename, isRoot = false) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const raw = fs.readFileSync(filename, "utf8");
  const source = isRoot ? transform(raw) : raw;
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiledModule = new Module(filename, module);
  cache.set(filename, compiledModule);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = compiledModule.require.bind(compiledModule);
  compiledModule.require = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/") || name.startsWith("./") || name.startsWith("../")) {
      const base = name.startsWith("@/") ? path.resolve(__dirname, "../src", name.slice(2)) : path.resolve(path.dirname(filename), name);
      for (const candidate of [base + ".ts", base + ".tsx", path.join(base, "index.ts")]) {
        if (fs.existsSync(candidate)) return compile(candidate);
      }
    }
    return originalRequire(name);
  };
  compiledModule._compile(compiled, filename);
  return compiledModule.exports;
  }
  return compile(path.resolve(__dirname, "..", relativePath), true);
};
