var path = require('path');

var soynode = require.resolve('soynode');
var soyJsFolder = path.resolve(path.dirname(soynode), '..', 'soy');

var ccpConfig = {
  tmpDir: './.soy_js_cache',
  jsRoot: [soyJsFolder],
  soyJar: path.join(soyJsFolder, 'SoyToJsSrcCompiler.jar'),
  soyUtilsJs: path.join(soyJsFolder, 'soyutils.js'),
};

module.exports = ccpConfig;
