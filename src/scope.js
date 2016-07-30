var _ = require('lodash');

module.exports = Scope;

function initWatchVal() {
}

function Scope() {
    this.$root = this;
    this.$$watchers = [];
    this.$$lastDirtyWatch = null;
    this.$$asyncQueue = [];
    this.$$applyAsyncQueue = [];
    this.$$postDigestQueue = [];
    this.$$phase = null;
    this.$$applyAsyncId = null;
    this.$$children = [];
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
    this.$root.$$lastDirtyWatch = null;

    return function () {
        var index = this.$$watchers.indexOf(watcher);

        if (index >= 0) {
            this.$root.$$lastDirtyWatch = null;
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
                self.$root.$digest();
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
        this.$root.$digest();
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
        this.$root.$$applyAsyncId = null;
    }
};

Scope.prototype.$applyAsync = function (expr) {
    var self = this;

    self.$$applyAsyncQueue.push(function () {
        self.$eval(expr);
    });

    if (self.$root.$$applyAsyncId === null) {
        self.$root.$$applyAsyncId = setTimeout(function () {
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

Scope.prototype.$$everyScope = function (fn) {
    if (fn(this)) {
        return this.$$children.every(function (child) {
            return child.$$everyScope(fn);
        });
    } else {
        return false;
    }
};

Scope.prototype.$$digestOnce = function () {
    var newValue;
    var oldValue;
    var isDirty = false;
    var continueLoop = true;
    var self = this;

    this.$$everyScope(function (scope) {

        _.forEachRight(scope.$$watchers, function (watcher) {
            try {
                if (watcher) {
                    newValue = watcher.watchFn(scope);
                    oldValue = watcher.last;

                    if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
                        self.$root.$$lastDirtyWatch = watcher;
                        watcher.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), scope);
                        watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
                        isDirty = true;
                    } else if (watcher === self.$root.$$lastDirtyWatch) {
                        continueLoop = false;
                        return false;
                    }
                }
            } catch (e) {
                console.log(e);
            }

        });

        return continueLoop;
    });

    return isDirty;
};

Scope.prototype.$digest = function () {
    var self = this;
    var dirty;
    var ttl = 10;
    this.$root.$$lastDirtyWatch = null;
    this.$beginPhase('$digest');

    if (this.$root.$$applyAsyncId) {
        clearTimeout(this.$root.$$applyAsyncId);
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

Scope.prototype.$new = function (isIsolated, parent) {
    var child;

    if (!(parent instanceof Scope)) {
        parent = parent || this;
    }

    if (!isIsolated) {
        var ChildScope = function () {
        };
        ChildScope.prototype = Object.create(this);
        child = new ChildScope();
    } else {
        child = new Scope();
        child.$root = parent.$root;
        child.$$phase = parent.$$phase;
        child.$$asyncQueue = parent.$$asyncQueue;
        child.$$postDigestQueue = parent.$$postDigestQueue;
        child.$$applyAsyncQueue = parent.$$applyAsyncQueue;
    }

    parent.$$children.push(child);
    child.$$children = [];
    child.$$watchers = [];
    child.$parent = parent;

    return child;
};

Scope.prototype.$destroy = function () {
    if (this.$parent) {
        var siblings = this.$parent.$$children;
        var index = siblings.indexOf(this);

        if (index >= 0) {
            siblings.splice(index, 1);
        }
    }
    this.$$watchers = null;
};