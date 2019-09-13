import {
  map,
  forEach,
  forEachRight,
  forOwn,
  bind,
  isObject,
  isEqual,
  isUndefined,
  isNull,
  isNumber,
  isNaN,
  cloneDeep,
  clone,
  isArray,
  tail
} from 'lodash';

function initWatchVal() {}

export default function Scope() {
  this.$root = this;
  this.$$watchers = [];
  this.$$lastDirtyWatch = null;
  this.$$asyncQueue = [];
  this.$$applyAsyncQueue = [];
  this.$$postDigestQueue = [];
  this.$$phase = null;
  this.$$applyAsyncId = null;
  this.$$children = [];
  this.$$listeners = {};
}

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
  const watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function() {},
    last: initWatchVal,
    valueEq: !!valueEq
  };

  this.$$watchers.unshift(watcher);
  this.$root.$$lastDirtyWatch = null;

  return function() {
    const index = this.$$watchers.indexOf(watcher);

    if (index >= 0) {
      this.$root.$$lastDirtyWatch = null;
      this.$$watchers.splice(index, 1);
    }
  }.bind(this);
};

Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
  const self = this;
  const newValues = [];
  const oldValues = [];
  let changeReactionScheduled = false;
  let needToCall = true;
  let firstRun = false;

  if (!watchFns.length) {
    self.$evalAsync(function() {
      if (needToCall) {
        listenerFn(newValues, newValues, self);
      }
    });

    return function() {
      needToCall = false;
    };
  }

  const destroyWatchers = map(watchFns, function(watchFn, i) {
    return self.$watch(watchFn, function(newValue, oldValue) {
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

  return function() {
    forEach(destroyWatchers, function(watcher) {
      watcher();
    });
  };
};

Scope.prototype.$eval = function(expr, locals) {
  return expr(this, locals);
};

Scope.prototype.$evalAsync = function(expr) {
  const self = this;

  if (!self.$$phase && !self.$$asyncQueue.length) {
    setTimeout(function() {
      if (self.$$asyncQueue.length) {
        self.$root.$digest();
      }
    }, 0);
  }

  self.$$asyncQueue.push({
    scope: self,
    expression: expr
  });
};

Scope.prototype.$apply = function(expr) {
  this.$beginPhase('$apply');

  try {
    return this.$eval(expr);
  } finally {
    this.$clearPhase();
    this.$root.$digest();
  }
};

Scope.prototype.$$postDigest = function(expr) {
  this.$$postDigestQueue.push(
    function() {
      this.$eval(expr);
    }.bind(this)
  );
};

Scope.prototype.$$flushApplyAsync = function() {
  while (this.$$applyAsyncQueue.length) {
    try {
      this.$$applyAsyncQueue.shift()();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    this.$root.$$applyAsyncId = null;
  }
};

Scope.prototype.$applyAsync = function(expr) {
  const self = this;

  self.$$applyAsyncQueue.push(function() {
    self.$eval(expr);
  });

  if (self.$root.$$applyAsyncId === null) {
    self.$root.$$applyAsyncId = setTimeout(function() {
      self.$apply(bind(self.$$flushApplyAsync, self));
    }, 0);
  }
};

Scope.prototype.$beginPhase = function(phase) {
  if (this.$$phase) {
    throw `${this.$$phase} already in progress.`;
  }

  this.$$phase = phase;
};

Scope.prototype.$clearPhase = function() {
  this.$$phase = null;
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
  if (valueEq) {
    return isEqual(newValue, oldValue);
  }

  return (
    newValue === oldValue ||
    (typeof newValue === 'number' && typeof oldValue === 'number' && isNaN(newValue) && isNaN(oldValue))
  );
};

Scope.prototype.$$everyScope = function(fn) {
  if (fn(this)) {
    return this.$$children.every(function(child) {
      return child.$$everyScope(fn);
    });
  }

  return false;
};

Scope.prototype.$$digestOnce = function() {
  let newValue;
  let oldValue;
  let isDirty = false;
  let continueLoop = true;
  const self = this;

  this.$$everyScope(function(scope) {
    forEachRight(scope.$$watchers, function(watcher) {
      try {
        if (watcher) {
          newValue = watcher.watchFn(scope);
          oldValue = watcher.last;

          if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
            self.$root.$$lastDirtyWatch = watcher;
            watcher.listenerFn(newValue, oldValue === initWatchVal ? newValue : oldValue, scope);
            watcher.last = watcher.valueEq ? cloneDeep(newValue) : newValue;
            isDirty = true;
          } else if (watcher === self.$root.$$lastDirtyWatch) {
            continueLoop = false;

            return false;
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    });

    return continueLoop;
  });

  return isDirty;
};

Scope.prototype.$digest = function() {
  const self = this;
  let dirty;
  let ttl = 10;

  this.$root.$$lastDirtyWatch = null;
  this.$beginPhase('$digest');

  if (this.$root.$$applyAsyncId) {
    clearTimeout(this.$root.$$applyAsyncId);
    this.$$flushApplyAsync();
  }

  do {
    while (this.$$asyncQueue.length) {
      const asyncTask = this.$$asyncQueue.shift();

      try {
        asyncTask.scope.$eval(asyncTask.expression);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    }

    dirty = this.$$digestOnce();
    if ((dirty || this.$$asyncQueue.length) && !ttl--) {
      this.$clearPhase();
      throw '10 digest iterations reached';
    }
  } while (dirty || this.$$asyncQueue.length);

  this.$clearPhase();

  while (self.$$postDigestQueue.length) {
    try {
      self.$$postDigestQueue.shift()();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }
};

Scope.prototype.$new = function(isIsolated, initialParent) {
  let child;
  let parent = initialParent;

  if (!(initialParent instanceof Scope)) {
    parent = initialParent || this;
  }

  if (!isIsolated) {
    const ChildScope = function() {};

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
  child.$$listeners = {};
  child.$parent = parent;

  return child;
};

function isArrayLike(obj) {
  if (isNull(obj) || isUndefined(obj)) {
    return false;
  }

  const length = obj.length;

  return length === 0 || (isNumber(length) && length > 0 && length - 1 in obj);
}

Scope.prototype.$watchCollection = function(watchFn, listenerFn) {
  const self = this;
  let newValue;
  let firstRun = true;
  let veryOldValue;
  const trackVeryOldValue = listenerFn.length > 1;
  let oldValue;
  let oldLength;
  let changeCount = 0;
  const internalWatchFn = function(scope) {
    let newLength;

    newValue = watchFn(scope);

    if (isObject(newValue)) {
      if (isArrayLike(newValue)) {
        if (!isArray(oldValue)) {
          changeCount++;
          oldValue = [];
        }

        if (newValue.length !== oldValue.length) {
          changeCount++;
          oldValue.length = newValue.length;
        }

        forEach(newValue, function(newItem, i) {
          const bothNaN = isNaN(newItem) && isNaN(oldValue[i]);

          if (!bothNaN && newItem !== oldValue[i]) {
            changeCount++;
            oldValue[i] = newItem;
          }
        });
      } else {
        if (!isObject(oldValue) || isArrayLike(oldValue)) {
          changeCount++;
          oldValue = {};
          oldLength = 0;
        }

        newLength = 0;

        forOwn(newValue, function(newVal, key) {
          newLength++;
          if (oldValue.hasOwnProperty(key)) {
            const oldValueItem = oldValue[key];
            const bothNaN = isNaN(newVal) && isNaN(oldValueItem);

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
          forOwn(oldValue, function(oldVal, key) {
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
  const internalListenerFn = function() {
    if (firstRun) {
      listenerFn(newValue, newValue, self);
      firstRun = false;
    } else {
      listenerFn(newValue, veryOldValue, self);
    }

    if (trackVeryOldValue) {
      veryOldValue = clone(newValue);
    }
  };

  return this.$watch(internalWatchFn, internalListenerFn);
};

Scope.prototype.$destroy = function() {
  this.$broadcast('$destroy');

  if (this.$parent) {
    const siblings = this.$parent.$$children;
    const index = siblings.indexOf(this);

    if (index >= 0) {
      siblings.splice(index, 1);
    }
  }
  this.$$watchers = null;
  this.$$listeners = {};
};

Scope.prototype.$on = function(eventName, listener) {
  let listeners = this.$$listeners[eventName];

  if (!listeners) {
    this.$$listeners[eventName] = listeners = [];
  }

  listeners.push(listener);

  return function() {
    const index = listeners.indexOf(listener);

    if (index !== -1) {
      listeners[index] = null;
    }
  };
};

Scope.prototype.$$fireEventOnScope = function(event, listenerArgs) {
  const listeners = this.$$listeners[event.name] || [];
  let index = 0;

  while (listeners.length > index) {
    if (listeners[index] === null) {
      listeners.splice(index, 1);
    } else {
      try {
        listeners[index].apply(null, listenerArgs);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
      index++;
    }
  }
};

Scope.prototype.$emit = function(eventName) {
  let doPropagate = true;
  const event = {
    name: eventName,
    targetScope: this,
    stopPropagation: function() {
      doPropagate = false;
    }
  };
  const listenerArgs = [event].concat(tail(arguments));
  let scope = this;

  while (scope && doPropagate) {
    event.currentScope = scope;
    scope.$$fireEventOnScope(event, listenerArgs);
    scope = scope.$parent;
  }

  event.currentScope = null;

  return event;
};

Scope.prototype.$broadcast = function(eventName) {
  const event = {
    name: eventName,
    targetScope: this
  };
  const listenerArgs = [event].concat(tail(arguments));

  this.$$everyScope(function(scope) {
    event.currentScope = scope;
    scope.$$fireEventOnScope(event, listenerArgs);

    return true;
  });

  event.currentScope = null;

  return event;
};
