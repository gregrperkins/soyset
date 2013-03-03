var fs = require('fs');

var racetrack = require('racetrack');
var funct = require('funct');
var besync = require('besync');

var should = require('shoulda');

var SoySet = require('..');
var util = require('util');

var ExampleSoySet = function() {
  SoySet.call(this);
};
util.inherits(ExampleSoySet, SoySet);

ExampleSoySet.prototype._getSoyRoots = function(cb) {
  cb(null, [
    'test/examples/ex1/green',
    'test/examples/ex1/mustard'
  ]);
};

var _verboseTrack = {print: true, indent: 2, fns: {
  // '_resetToCompiledButNotLoaded': false
}};
var _silentTrack = {};

describe('soyset', function () {
  var _getSoySet = function () {
    racetrack.configure(this.soySet, _silentTrack);
    return this.soySet;
  };

  before(function() {
    this.soySet = new ExampleSoySet();
    racetrack.mochaHook();
  })

  it('is started with a proper soyJar', function (done) {
    var soySet = _getSoySet.call(this);
    return besync.waterfall(done, [
      function (next) {
        should.exist(this.options.soyJar);
        this.options.soyJar.should.endWith('SoyToJsSrcCompiler.jar');
        fs.stat(this.options.soyJar, next);
      },
      function (stat, next) {
        should.exist(stat);
        stat.isFile().should.be.true;
        next();
      }
    ], soySet);
  });

  describe('getManifest', function() {
    it('gives callback a list of soy files', function (done) {
      var soySet = _getSoySet.call(this);
      return besync.waterfall(done, [
        soySet.getManifest,
        function (soyManifest, next) {
          // Check that we match the things we think we should
          soyManifest.should.matchSet({
            'examples/ex1/green/simple.soy$': 1,
            'examples/ex1/mustard/colonal.soy$': 1,
            '.soy$': soyManifest.length
          });
          next();
        }
      ], soySet);
    });
  });

  describe('makeProjectSoyJsRoot', function() {
    it('outputs a directory with compiled js', function (done) {
      var soySet = _getSoySet.call(this);
      return besync.waterfall(done, [
        soySet.makeProjectSoyJsRoot,
        soySet.findJsFiles,
        function (soyJsFiles, next) {
          soyJsFiles.should.have.length(2);
          next();
        }
      ], soySet);
    });
  });

  describe('toFiles', function() {
    it('gives callback a list of strings', function (done) {
      var soySet = _getSoySet.call(this);
      soySet.toFiles(funct.err(done, function (names) {
        names[0].should.match(/examples\/ex1\/green\/simple.soy.js$/);
        names[1].should.match(/examples\/ex1\/mustard\/colonal.soy.js$/);
        done();
      }));
    });
  });

  describe('toScripts', function(obj) {
    it('gives callback an object', function (done) {
      var soySet = _getSoySet.call(this);
      return besync.waterfall(done, [
        soySet.toScripts,
        function (scripts) {
          var names = Object.keys(scripts).sort();

          names[0].should.match(/examples\/ex1\/green\/simple.soy.js$/);
          scripts[names[0]].should.include(
            'green.simple.main = function(');

          names[1].should.match(/examples\/ex1\/mustard\/colonal.soy.js$/);
          scripts[names[1]].should.include(
            'mustard.colonal.leadPipe = function(');

          done();
        }
      ], soySet);
    });
  });

  describe('toFunctions', function () {
    it('compiles the templates onto an object', function (done) {
      var soySet = _getSoySet.call(this);
      soySet.toFunctions(funct.err(done, function (templates) {
        var globals = Object.keys(templates).sort();
        // Check that we at least got some basic props exposed
        var expectedGlobals = ['soy', 'goog', 'green', 'mustard'];
        expectedGlobals.forEach(function (key) {
          globals.should.include(key);
        });
        done();
      }));
    }); // templates onto an object

    it('creates usable functions', function (done) {
      var soySet = _getSoySet.call(this);
      soySet.toFunctions(funct.err(done, function (templates) {
        // Can't use should directly on these, created in sub-vm
        new should.Assertion(templates.green.simple.main).be.a('function');
        new should.Assertion(templates.green.simple.silly).be.a('function');

        // Check the most basic template functionality
        templates.green.simple.main().should.equal(
          'Green\'s main man.');

        // This uses a soy.* function
        templates.green.simple.silly({
          'name': 'poo'
        }).should.equal('You, poo, are silly.');
        done();
      }));
    }); // usable functions
  }); // toFunctions
});
