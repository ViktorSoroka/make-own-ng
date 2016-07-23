var _ = require('lodash');

module.exports = Scope;

function initWatchVal() {
}

function Scope() {
    this.$$watchers      = [];
    this.$lastDirtyWatch = null;
}

Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
    var watcher = {
        watchFn   : watchFn,
        listenerFn: listenerFn || function () {
        },
        last      : initWatchVal,
        valueEq   : !!valueEq
    };

    this.$$watchers.push(watcher);
    this.$lastDirtyWatch = null;
};

Scope.prototype.$$areEqual = function (newValue, oldValue, valueEq) {
    if (valueEq) {
        return _.isEqual(newValue, oldValue);
    } else {
        return newValue === oldValue;
    }
};

Scope.prototype.$$digestOnce = function () {
    var self    = this;
    var newValue;
    var oldValue;
    var isDirty = false;

    _.forEach(this.$$watchers, function (watcher) {
        newValue = watcher.watchFn(self);
        oldValue = watcher.last;

        if (!self.$$areEqual(newValue, oldValue, watcher.valueEq)) {
            self.$lastDirtyWatch = watcher;
            watcher.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), self);
            watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
            isDirty      = true;
        } else if (watcher === self.$lastDirtyWatch) {
            return false;
        }

    });

    return isDirty;
};

Scope.prototype.$digest = function () {
    var dirty;
    var ttl              = 10;
    this.$lastDirtyWatch = null;

    do {
        dirty = this.$$digestOnce();
        if (dirty && !(ttl--)) {
            throw '10 digest iterations reached';
        }
    } while (dirty);
};