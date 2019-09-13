var _ = require('lodash');

function initWatchVal() {
}

export default function Scope() {
    this.$root             = this;
    this.$$watchers        = [];
    this.$$lastDirtyWatch  = null;
    this.$$asyncQueue      = [];
    this.$$applyAsyncQueue = [];
    this.$$postDigestQueue = [];
    this.$$phase           = null;
    this.$$applyAsyncId    = null;
    this.$$children        = [];
    this.$$listeners       = {};
}

Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
    var watcher = {
        watchFn   : watchFn,
        listenerFn: listenerFn || function () {
        },
        last      : initWatchVal,
        valueEq   : !!valueEq
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
    var self                    = this;
    var newValues               = [];
    var oldValues               = [];
    var changeReactionScheduled = false;
    var needToCall              = true;
    var firstRun                = false;

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

    self.$$asyncQueue.push({ scope: self, expression: expr });
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
            console.error(e);
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
    var isDirty      = false;
    var continueLoop = true;
    var self         = this;

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
                        isDirty      = true;
                    } else if (watcher === self.$root.$$lastDirtyWatch) {
                        continueLoop = false;
                        return false;
                    }
                }
            } catch (e) {
                console.error(e);
            }

        });

        return continueLoop;
    });

    return isDirty;
};

Scope.prototype.$digest = function () {
    var self = this;
    var dirty;
    var ttl  = 10;

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
                console.error(e);
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
            console.error(e);
        }
    }
};

Scope.prototype.$new = function (isIsolated, parent) {
    var child;

    if (!(parent instanceof Scope)) {
        parent = parent || this;
    }

    if (!isIsolated) {
        var ChildScope       = function () {
        };
        ChildScope.prototype = Object.create(this);
        child                = new ChildScope();
    } else {
        child                   = new Scope();
        child.$root             = parent.$root;
        child.$$phase           = parent.$$phase;
        child.$$asyncQueue      = parent.$$asyncQueue;
        child.$$postDigestQueue = parent.$$postDigestQueue;
        child.$$applyAsyncQueue = parent.$$applyAsyncQueue;
    }

    parent.$$children.push(child);
    child.$$children  = [];
    child.$$watchers  = [];
    child.$$listeners = {};
    child.$parent     = parent;

    return child;
};

function isArrayLike(obj) {
    if (_.isNull(obj) || _.isUndefined(obj)) {
        return false;
    }

    var length = obj.length;

    return length === 0 ||
        (_.isNumber(length) && length > 0 && (length - 1) in obj);
}

Scope.prototype.$watchCollection = function (watchFn, listenerFn) {
    var self               = this;
    var newValue;
    var firstRun           = true;
    var veryOldValue;
    var trackVeryOldValue  = (listenerFn.length > 1);
    var oldValue;
    var oldLength;
    var changeCount        = 0;
    var internalWatchFn    = function (scope) {
        var newLength;

        newValue = watchFn(scope);

        if (_.isObject(newValue)) {
            if (isArrayLike(newValue)) {
                if (!_.isArray(oldValue)) {
                    changeCount++;
                    oldValue = [];
                }

                if (newValue.length !== oldValue.length) {
                    changeCount++;
                    oldValue.length = newValue.length;
                }

                _.forEach(newValue, function (newItem, i) {
                    var bothNaN = _.isNaN(newItem) && _.isNaN(oldValue[i]);
                    if (!bothNaN && newItem !== oldValue[i]) {
                        changeCount++;
                        oldValue[i] = newItem;
                    }
                });
            } else {
                if (!_.isObject(oldValue) || isArrayLike(oldValue)) {
                    changeCount++;
                    oldValue  = {};
                    oldLength = 0;
                }

                newLength = 0;

                _.forOwn(newValue, function (newVal, key) {
                    newLength++;
                    if (oldValue.hasOwnProperty(key)) {
                        var oldValueItem = oldValue[key];
                        var bothNaN      = _.isNaN(newVal) && _.isNaN(oldValueItem);

                        if (!bothNaN && newVal !== oldValueItem) {
                            oldValue[key] = newVal;
                            changeCount++;
                        }
                    } else {
                        changeCount++;
                        oldLength++;
                        oldValue[key] = newVal;
                    }
                });

                if (newLength < oldLength) {
                    changeCount++;
                    _.forOwn(oldValue, function (oldVal, key) {
                        if (!newValue.hasOwnProperty(key)) {
                            delete oldValue[key];
                            oldLength--;
                        }
                    });
                }
            }
        } else {
            if (!self.$$areEqual(newValue, oldValue, false)) {
                changeCount++;
            }

            oldValue = newValue;
        }
        return changeCount;
    };
    var internalListenerFn = function () {
        if (firstRun) {
            listenerFn(newValue, newValue, self);
            firstRun = false;
        } else {
            listenerFn(newValue, veryOldValue, self);
        }

        if (trackVeryOldValue) {
            veryOldValue = _.clone(newValue);
        }
    };

    return this.$watch(internalWatchFn, internalListenerFn);
};

Scope.prototype.$destroy = function () {
    this.$broadcast('$destroy');

    if (this.$parent) {
        var siblings = this.$parent.$$children;
        var index    = siblings.indexOf(this);

        if (index >= 0) {
            siblings.splice(index, 1);
        }
    }
    this.$$watchers  = null;
    this.$$listeners = {};
};

Scope.prototype.$on = function (eventName, listener) {
    var listeners = this.$$listeners[eventName];

    if (!listeners) {
        this.$$listeners[eventName] = listeners = [];
    }

    listeners.push(listener);

    return function () {
        var index = listeners.indexOf(listener);

        if (index !== -1) {
            listeners[index] = null;
        }
    };
};

Scope.prototype.$$fireEventOnScope = function (event, listenerArgs) {
    var listeners = this.$$listeners[event.name] || [];
    var index     = 0;

    while (listeners.length > index) {
        if (listeners[index] === null) {
            listeners.splice(index, 1);
        } else {
            try {
                listeners[index].apply(null, listenerArgs);
            } catch (e) {
                console.error(e);
            }
            index++;
        }
    }
};

Scope.prototype.$emit = function (eventName) {
    var doPropagate  = true;
    var event        = {
        name           : eventName,
        targetScope    : this,
        stopPropagation: function () {
            doPropagate = false;
        }
    };
    var listenerArgs = [event].concat(_.tail(arguments));
    var scope        = this;

    while (scope && doPropagate) {
        event.currentScope = scope;
        scope.$$fireEventOnScope(event, listenerArgs);
        scope = scope.$parent;
    }

    event.currentScope = null;

    return event;
};

Scope.prototype.$broadcast = function (eventName) {
    var event        = { name: eventName, targetScope: this };
    var listenerArgs = [event].concat(_.tail(arguments));

    this.$$everyScope(function (scope) {
        event.currentScope = scope;
        scope.$$fireEventOnScope(event, listenerArgs);
        return true;
    });

    event.currentScope = null;

    return event;
};
