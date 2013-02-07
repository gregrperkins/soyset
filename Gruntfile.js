module.exports = function(grunt) {
  var currentTests = ['test/*.js'];

  var currentWatch = currentTests.slice();
  currentWatch.push('lib/**/*.js');
  grunt.initConfig({
    'mocha-hack': {
      all: {
        src: currentTests,
        options: {
          useColors: true,
          reporter: 'spec',
          timeout: 3000 // some things are real slow
        }
      }
    },

    watch: {
      allTests: {
        files: currentWatch,
        tasks: ['test']
      }
    }
  });

  grunt.loadNpmTasks('grunt-mocha-hack');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('test', 'mocha-hack');
  grunt.registerTask('default', 'test');
  grunt.registerTask('tdd', ['test', 'watch']);
};
