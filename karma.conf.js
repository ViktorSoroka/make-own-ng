module.exports = function (config) {
    config.set({
        frameworks: ['browserify', 'jasmine'],
        reporters: ['progress', 'coverage'],
        files: [
            'src/**/*.js',
            'test/**/*_spec.js'
        ],

        preprocessors: {
            'test/**/*.js': ['jshint', 'browserify'],
            'src/**/*.js': ['jshint', 'browserify', 'coverage']
        },

        browsers: ['Chrome'],

        autoWatch: true,

        browserify: {
            debug: true,
            bundleDelay: 2000 // Fixes "reload" error messages, YMMV!
        },

        coverageReporter: {
            type: 'lcov',
            dir: 'coverage'
        }
    })
};