var _ = require('lodash');

module.exports = Scope;

function initWatchVal() {
}

function Scope() {
    this.$$watchers = [];
    this.$lastDirtyWatch = null;
    this.$$asyncQueue = [];
    this.$$applyAsyncQueue = [];
    this.$$postDigestQueue = [];
    this.$$phase = null;
    this.$$applyAsyncId = null;
}

Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn || function () {
        },
        last: initWatchVal,
        valueEq: !!valueEq
    };

    this.$$watchers.unshift(watcher);
    this.$lastDirtyWatch = null;

    return function () {
        var index = this.$$watchers.indexOf(watcher);

        if (index >= 0) {
            this.$lastDirtyWatch = null;
            this.$$watchers.splice(index, 1);
        }
    }.bind(this);
};

Scope.prototype.$watchGroup = function (watchFns, listenerFn) {
    var self = this;
    var newValues = [];
    var oldValues = [];
    var changeReactionScheduled = false;
    var needToCall = true;
    var firstRun = false;

    if (!watchFns.length) {
        self.$evalAsync(function () {
            if (needToCall) {
                listenerFn(newValues, newValues, self);
            }
        });
        return function () {
            needToCall = false;
        };
    }

    var destroyWatchers = _.map(watchFns, function (watchFn, i) {
        return self.$watch(watchFn, function (newValue, oldValue) {
            newValues[i] = newValue;
            oldValues[i] = oldValue;

            function watchGroupListener() {
                if (!firstRun) {
                    firstRun = true;
                    listenerFn(newValues, newValues, self);
                } else {
                    listenerFn(newValues, oldValues, self);
                }
                changeReactionScheduled = false;
            }

            if (!changeReactionScheduled) {
                changeReactionScheduled = true;
                self.$evalAsync(watchGroupListener);
            }

        });

    });

    return function () {
        _.forEach(destroyWatchers, function (watcher) {
            watcher();
        });
    };

};

Scope.prototype.$eval = function (expr, locals) {
    return expr(this, locals);
};

Scope.prototype.$evalAsync = function (expr) {
    var self = this;

    if (!self.$$phase && !self.$$asyncQueue.length) {
        setTimeout(function () {
            if (self.$$asyncQueue.length) {
                self.$digest();
            }
        }, 0);
    }

    self.$$asyncQueue.push({scope: self, expression: expr});
};

Scope.prototype.$apply = function (expr) {
    this.$beginPhase('$apply');

    try {
        return this.$eval(expr);
    } finally {
        this.$clearPhase();
        this.$digest();
    }
};

Scope.prototype.$$postDigest = function (expr) {
    this.$$postDigestQueue.push(function () {
        this.$eval(expr);
    }.bind(this));
};

Scope.prototype.$$flushApplyAsync = function () {
    while (this.$$applyAsyncQueue.length) {
        try {
            this.$$applyAsyncQueue.shift()();
        } catch (e) {
            console.log(e);
        }
        self.$$applyAsyncId = null;
    }
};

Scope.prototype.$applyAsync = function (expr) {
    var self = this;

    self.$$applyAsyncQueue.push(function () {
        self.$eval(expr);
    });

    if (self.$$applyAsyncId === null) {
        self.$$applyAsyncId = setTimeout(function () {
            self.$apply(_.bind(self.$$flushApplyAsync, self));
        }, 0);
    }
};

Scope.prototype.$beginPhase = function (phase) {
    if (this.$$phase) {
        throw this.$$phase + ' already in progress.';
    }
    this.$$phase = phase;
};

Scope.prototype.$clearPhase = function () {
    this.$$phase = null;
};

Scope.prototype.$$areEqual = function (newValue, oldValue, valueEq) {
    if (valueEq) {
        return _.isEqual(newValue, oldValue);
    } else {
        return newValue === oldValue ||
            (typeof newValue === 'number' && typeof oldValue === 'number' &&
            isNaN(newValue) && isNaN(oldValue));
    }
};

Scope.prototype.$$digestOnce = function () {
    var self = this;
    var newValue;
    var oldValue;
    var isDirty = false;

    _.forEachRight(this.$$watchers, function (watcher) {
        try {
            if (watcher) {
                newValue = watcher.watchFn(self);
                oldValue = watcher.last;

                if (!self.$$areEqual(newValue, oldValue, watcher.valueEq)) {
                    self.$lastDirtyWatch = watcher;
                    watcher.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), self);
                    watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
                    isDirty = true;
                } else if (watcher === self.$lastDirtyWatch) {
                    return false;
                }
            }
        } catch (e) {
            console.log(e);
        }

    });

    return isDirty;
};

Scope.prototype.$digest = function () {
    var self = this;
    var dirty;
    var ttl = 10;
    this.$lastDirtyWatch = null;
    this.$beginPhase('$digest');

    if (this.$$applyAsyncId) {
        clearTimeout(this.$$applyAsyncId);
        this.$$flushApplyAsync();
    }

    do {
        while (this.$$asyncQueue.length) {
            var asyncTask = this.$$asyncQueue.shift();
            try {
                asyncTask.scope.$eval(asyncTask.expression);
            } catch (e) {
                console.log(e);
            }
        }

        dirty = this.$$digestOnce();
        if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
            this.$clearPhase();
            throw '10 digest iterations reached';
        }
    } while (dirty || this.$$asyncQueue.length);

    this.$clearPhase();

    while (self.$$postDigestQueue.length) {
        try {
            self.$$postDigestQueue.shift()();
        } catch (e) {
            console.log(e);
        }
    }
};