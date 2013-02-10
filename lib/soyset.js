// TODO(gregp): move out of soy
var glob = require('glob');

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var vm = require('vm');

var timewalk = require('timewalk');

var besync = require('besync');
var funct = require('funct');

/**
 * A soy compiler for multiple root projects.
 * TODO(gregp): mock soy compiler for tests
 * @constructor
 */
var SoySet = function () {
  this.soyJs = {
    root: null,
    lastModified: null,
    scripts: null
  };
  this.options = this._options();
};
module.exports = SoySet;

/**
 * Overridable tracing function
 * FIXME(gregp): autoregister, remove this function
 */
var racetrack = require('racetrack');
SoySet.prototype.trace = racetrack.traceholder;

//////////////////////////////////////////////////////////////////////////////
// EXTERNAL INTERFACE
//////////////////////////////////////////////////////////////////////////////
/**
 * Initialize so that we know our file list is up to date.
 * TODO(gregp): rename to reinit or refresh or something...
 * @param {function(Error=)}
 * @protected -
 */
SoySet.prototype._refresh = function(cb) {
  return this._resetToCompiledButNotLoaded(cb);
};

/**
 * Get the soy roots, assuming that we have been refreshed.
 * @param {function(Error=, Array.<string>)} cb - Passed the array of soy roots
 * @protected
 */
SoySet.prototype._getSoyRoots = function(cb) {
  cb(null, []);
};


/**
 * Return the options
 * @protected
 */
SoySet.prototype._options = function () {
  return require('./paths');
};
//////////////////////////////////////////////////////////////////////////////

SoySet.prototype._resetOptions = function(cb) {
  this.options = this._options();
  cb();
};

/**
 * TODO(gregp): this is a weird state to reset to, but it's the furthest back
 *  we can go before actually having to call back to the soy compiler... We
 *  should be using TimeWalk to figure out whether the soy source directory
 *  needs to be recompiled.
 */
SoySet.prototype._resetToCompiledButNotLoaded = function(cb) {
  cb = this.trace(this, cb, '_resetToCompiledButNotLoaded', this.soyJs);
  this.soyJs.scripts = this.soyJs.scripts || {};
  this.soyJs.global = this.soyJs.global || vm.createContext();
  cb();
};

/**
 * Gets the output js root, then finds files in it.
 * @param {function(Error=, Array.<string>)} cb - Passed an array of filenames
 */
SoySet.prototype.findProjectJsFiles = function(cb) {
  var root = this.soyJs.root;
  return this.findJsFiles(root, cb);
};


/**
 * Compiles the project's soy files, generating an array of their filenames.
 * @param {function(Error=, Array.<string>)} cb - Given a list
 *    of the pathnames (relative to this.soyJs.root) of all soy.js files
 *    compiled for this project.
 */
SoySet.prototype.toFiles = function (cb) {
  cb = this.trace(this, cb, 'toFiles');

  return besync.waterfall(cb, [
    // compile all the files on our ccp project, producing a root
    this.makeProjectSoyJsRoot,
    // then find the js files in our project
    funct.drop(1),
    this.findProjectJsFiles,
  ], this);
};

/**
 * @param {!string} absSoyJs - The absolute path to the compiled soyJs
 * @param {!string} data - The js contents of the file
 * @param {function(Error=, string)} cb - Given the compiled contents
 */
SoySet.prototype._cacheJsData = function (absSoyJs, data, cb) {
  cb = this.trace(this, cb, '_cacheJsData', absSoyJs, data.length, this.soyJs.scripts);
  var root = this.soyJs.root;
  var relative = path.relative(root, absSoyJs);
  this.soyJs.scripts[relative] = data;
  cb(null, data);
};

/**
 * Reads the given soy.js file, adding it to the local instance's cache.
 *    assumed to be relative to the overall soyJs.root
 *
 * @param {string} absSoyJs - Absolute path to the soyJs file desired.
 * @param {function(Error=, ?string=)} cb - Passed the contents of the
 *    compiled js file
 */
SoySet.prototype._readSoyJsFile = function (absSoyJs, cb) {
  cb = this.trace(this, cb, '_readSoyJsFile', absSoyJs);

  return besync.waterfall(cb, [
    funct.partial(fs.readFile, absSoyJs, 'utf8'),
    funct.partial(this._cacheJsData, absSoyJs),
  ], this);
};

/**
 * Converts the project's soy roots to script files,
 *    generating an array of their contents.
 *
 * @param {function(Error=, Object.<string, string>)} cb - Given a map
 *    from js files to their contents.
 */
SoySet.prototype.toScripts = function (cb) {
  cb = this.trace(this, cb, 'toScripts');

  // TODO(gregp): we could probably use timewalk here to only recalc
  //  if any soyJs file was modified

  besync.waterfall(cb, [
    this.makeProjectSoyJsRoot,
    funct.drop(1),
    this.findProjectJsFiles,
    this._soyJsFilesToScriptMap,
    this.getScriptMap
  ], this);
};

SoySet.prototype._soyJsFilesToScriptMap = function(soyJsFiles, cb) {
  cb = this.trace(this, cb, '_soyJsFilesToScriptMap', soyJsFiles);
  // forEach since we store the map on ourselves
  besync.forEach(soyJsFiles, this._readSoyJsFile, cb, this);
};

SoySet.prototype.runScript = function (scriptData, path) {
  vm.runInContext(scriptData, this.soyJs.global, path);
};

/**
 * @param {!string|number} scriptKey - script key in this.soyJs.scriptSet
 */
SoySet.prototype.getScriptData = function (scriptKey, done) {
  if (scriptKey === SoySet.SOY_UTILS_JS) {
    fs.readFile(this.options.soyUtilsJs, 'utf8', function (err, data) {
      if (err) return done(err);
      // console.log(data);
      this.runScript(data, this.options.soyUtilsJs);
      done();
    }.bind(this));
  } else {
    this.runScript(this.soyJs.scriptSet[scriptKey], scriptKey);
    done();
  }
};

SoySet.prototype.setScriptSet = function (soyJsScripts, next) {
  this.soyJs.scriptSet = soyJsScripts;
  return next();
};

SoySet.SOY_UTILS_JS = 0;
SoySet.prototype.getScriptSet = function(next) {
  var scripts = Object.keys(this.soyJs.scriptSet);
  // Prepend the support script token.
  scripts.unshift(SoySet.SOY_UTILS_JS);
  return next(null, scripts);
};

SoySet.prototype.getJsGlobal = function(next) {
  return next(null, this.soyJs.global);
};

SoySet.prototype.compileScriptSet = function (scriptSet, next) {
  besync.forEach(scriptSet, this.getScriptData, next, this);
};

// TODO(gregp): decompose this function
SoySet.prototype.toFunctions = function (cb) {
  cb = this.trace(this, cb, 'toFunctions');

  besync.waterfall(cb, [
    this.toScripts,
    this.setScriptSet,
    this.getScriptSet,
    this.compileScriptSet,
    this.getJsGlobal
  ], this);
};

SoySet.prototype._soyRootsToSoyFiles = function(soyRoots, cb) {
  cb = this.trace(this, cb, '_soyRootsToSoyFiles', soyRoots);

  var flattenMatchSets = function (matchSets, next){
    var matches = [].concat.apply([], matchSets);
    return next(null, matches);
  };

  var soyRootsToMatchSets = besync.mapper(soyRoots, this.findSoyFiles, this);

  return besync.waterfall(cb, [
    soyRootsToMatchSets,
    flattenMatchSets,
  ], this);
};

/**
 * @param {function(Error=, Array.<string>)} cb
 *    given the manifest of soy files
 */
SoySet.prototype.getManifest = function (cb) {
  cb = this.trace(this, cb, 'getManifest');

  // Errors short circuit to guarantee that each of matches exists on fs.
  return besync.waterfall(cb, [
    this.getSoyRoots,
    this._soyRootsToSoyFiles,
  ], this);
};

/**
 * Asynchronously get the soy compiled js root.
 * @param {function(Error=, string)} cb - Passed the root of the soyJs output
 */
SoySet.prototype.getSoyJsRoot = function (cb) {
  cb = this.trace(this, cb, 'getSoyJsRoot');
  var root = this.soyJs.root;
  return cb(null, root);
};

/**
 * Asynchronously get the soy root.
 * @param {function(Error=, Array.<string>)} cb - Passed the array of soy roots
 */
SoySet.prototype.getSoyRoots = function(cb) {
  cb = this.trace(this, cb, 'getSoyRoots');
  return besync.waterfall(cb, [
    this._refresh,
    this._getSoyRoots
  ], this);
};

/**
 * Asynchronously get the scripts map.
 */
SoySet.prototype.getScriptMap = function (cb) {
  cb = this.trace(this, cb, 'getScriptMap');
  var scripts = this.soyJs.scripts;
  return cb(null, scripts);
};


/**
 * @param {Array.<string>} files - Absolute paths
 * @param {function(Error=, boolean)} cb - Passed whether any of the files
 *    have changed since this.soyJs.lastModified.
 */
SoySet.prototype._filesDirty = function (files, cb) {
  var lastModified = this.soyJs.lastModified || 0;

  var _fileChangedSince = function (filename, cb) {
    return besync.waterfall(cb, [
      funct.partial(fs.stat, filename),
      function(stat, next) {
        var cur = +stat.mtime;
        next(null, cur > lastModified);
      },
    ], this);
  };

  // TODO(gregp): maybe keep the lastModified time up to date at the same time?
  //  (use besync.forEach rather than besync.any...)
  return besync.any(files, _fileChangedSince, cb, this);
};

SoySet.prototype.recompile = function(files, cb) {
  var setSoyJsRoot = function (outDir, next) {
    this.soyJs.root = outDir;
    next(null, outDir);
  };
  // TODO(gregp): funct.throw, and make waterfall wrap in try/catch

  var updateLastModified = function (outDir){
    // We have to rewalk the tree to get the system mtime for each of files,
    //  since node's is (unfortunately) more precise,
    //  and could therefore seem newer when it's not actually.
    timewalk.walkMtime(outDir, funct.err(cb, function (mtime) {
      this.soyJs.lastModified = mtime;
      cb(null, outDir);
    }, this));
  };

  besync.waterfall(cb, [
    funct.partial(_compile, files, this.options),
    setSoyJsRoot,
    updateLastModified
  ], this);
};

/**
 * @param {function(Error=, string)} cb - Passed the root of the output js dir
 *    after compilation.
 */
SoySet.prototype.maybeCompileFiles = function (files, cb) {
  cb = this.trace(this, cb, 'maybeCompileFiles');

  var maybeRecompile = funct.err(cb, function (isChanged) {
    if (isChanged) {
      this.recompile(files);
    } else {
      cb(null, this.soyJs.root);
    }
  }, this);

  if (!this.soyJs.root) {
    // If no soy root, need to recompile
    this.recompile(files, cb)
  } else {
    this._filesDirty(files, maybeRecompile);
  }
};

SoySet.prototype.compileProjectFiles = function (cb) {
  return besync.waterfall(cb, [
    this.getManifest,
    this.maybeCompileFiles,
  ], this);
};

/**
 * @param {function(Error=, string)} cb - Passed the root of the output js dir
 *    after compilation.
 */
SoySet.prototype.makeProjectSoyJsRoot = function(cb) {
  cb = this.trace(this, cb, 'makeProjectSoyJsRoot');
  return besync.waterfall(cb, [
    this.compileProjectFiles,
    funct.partial(this.getSoyJsRoot, cb),
  ], this);
};

function _compile(manifest, options, cb) {
  if (manifest.length < 1) {
    cb(new Error("Cannot compile 0 files."));
  }

  // TODO(gregp): sync mode?

  // Create a unique directory for this compilation within the tmp directory.
  var formattedDate = new Date().toISOString().replace(/\:/g, '_');
  var outDir = path.join(options.tmpDir, formattedDate);
  var outPathSpec = path.join(outDir, '{INPUT_DIRECTORY}{INPUT_FILE_NAME}.js');
  // console.log(outPathSpec); // TODO(gregp): check ^^^^^^^^^^^^^ on windows

  // Arguments for running the soy compiler via java.
  var args = [
    '-jar', options.soyJar,
    '--codeStyle', 'concat',
    '--shouldGenerateJsdoc',
    '--outputPathFormat', outPathSpec
  ];
  // console.log(manifest);
  args = args.concat(manifest);
  if (options.closureStyle) {
    args.push('--shouldProvideRequireSoyNamespaces');
  }
  // console.log(args.join(' '));

  // FIXME(gregp): wrapper per http://stackoverflow.com/questions/9697227
  var soyJava = spawn('java', args);
  // TODO(gregp): only pipe for debug...
  soyJava.stdout.pipe(process.stdout);
  soyJava.stderr.pipe(process.stderr);

  soyJava.on('exit', function (exitCode) {
    if (exitCode != 0) {
      console.error('Tried to compile via: java ' + args.join(' '));
      // Log all the errors and execute the cb with a generic error object.
      cb(new Error('Error compiling templates'));
    } else {
      // // Build a list of paths that we expect as output of the soy compiler.
      // var templatePaths = manifest.map(function (file) {
      //   return path.join(outDir, file) + '.js'
      // });

      // console.log('Soy compiled to:\n  ' + templatePaths.join('\n  '));
      cb(null, outDir);
    }
  });
};



//////////////////////////////////////////////////////////////////////////////
// TODO(gregp): move out of soy
var filesWithExt = function (ext, opts, root, cb) {
  this.trace && (cb = this.trace(this, cb, 'filesWithExt'));
  var spec = root + '/**/*.' + ext;
  // TODO(gregp): statCache
  glob(spec, opts || {}, cb);
};
SoySet.prototype.findJsFiles = funct.partial(filesWithExt, 'js',
  null // TODO(gregp): statCache
);
SoySet.prototype.findSoyFiles = funct.partial(filesWithExt, 'soy',
  null // TODO(gregp): statCache
);
//////////////////////////////////////////////////////////////////////////////
