var _ = require('lodash');

module.exports = Scope;

function Scope() {
    this.$$watchers = [];
}

Scope.prototype.$watch = function (watchFn, listenerFn) {
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn,
        last: function () {
        }
    };

    this.$$watchers.push(watcher);
};

Scope.prototype.$digest = function () {
    var self = this;
    var newValue;
    var oldValue;

    _.forEach(this.$$watchers, function (watcher) {
        newValue = watcher.watchFn(self);
        oldValue = watcher.last;

        if (newValue !== oldValue) {
            watcher.listenerFn(newValue, oldValue, self);
            watcher.last = newValue;
        }

    });
};