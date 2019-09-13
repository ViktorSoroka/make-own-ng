import {
  range,
  times,
  forEach
} from 'lodash';

import Scope from '../src/scope';

describe('Scope', function() {
  let scope;

  beforeEach(function() {
    scope = new Scope();
  });

  it('can be constructed and used as an object', function() {
    scope.aProperty = 1;
    expect(scope.aProperty).toBe(1);
  });

  describe('digest', function() {
    it('calls the listener function of a watch on first $digest', function() {
      const watchFn = function() {
        return 'wat';
      };
      const listenerFn = jest.fn();

      scope.$watch(watchFn, listenerFn);
      scope.$digest();
      expect(listenerFn).toHaveBeenCalled();
    });

    it('calls the watch function with the scope as the argument', function() {
      const watchFn = jest.fn();
      const listenerFn = function() {};

      scope.$watch(watchFn, listenerFn);
      scope.$digest();
      expect(watchFn).toHaveBeenCalledWith(scope);
    });

    it('calls the listener function when the watched value changes', function() {
      scope.someValue = 'a';
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.someValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );

      expect(scope.counter).toBe(0);
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.someValue = 'b';
      expect(scope.counter).toBe(1);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('calls listener when watch value is first undefined', function() {
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.someValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('calls listener with new value as old value the first time', function() {
      let oldValueGiven;

      scope.someValue = 123;
      scope.$watch(
        function(scope) {
          return scope.someValue;
        },
        function(newValue, oldValue) {
          oldValueGiven = oldValue;
        }
      );
      scope.$digest();
      expect(oldValueGiven).toBe(123);
    });

    it('may have watchers that omit the listener function', function() {
      const watchFn = jest.fn(() => 'something');

      scope.$watch(watchFn);
      scope.$digest();
      expect(watchFn).toHaveBeenCalled();
    });

    it('triggers chained watchers in the same digest', function() {
      scope.name = 'Jane';
      scope.$watch(
        function(scope) {
          return scope.nameUpper;
        },
        function(newValue, oldValue, scope) {
          if (newValue) {
            scope.initial = `${newValue.substring(0, 1)}.`;
          }
        }
      );
      scope.$watch(
        function(scope) {
          return scope.name;
        },
        function(newValue, oldValue, scope) {
          if (newValue) {
            scope.nameUpper = newValue.toUpperCase();
          }
        }
      );

      scope.$digest();
      expect(scope.initial).toBe('J.');
      scope.name = 'Bob';
      scope.$digest();
      expect(scope.initial).toBe('B.');
    });

    it('gives up on the watches after 10 iterations', function() {
      scope.counterA = 0;
      scope.counterB = 0;
      scope.$watch(
        function(scope) {
          return scope.counterA;
        },
        function(newValue, oldValue, scope) {
          scope.counterB++;
        }
      );
      scope.$watch(
        function(scope) {
          return scope.counterB;
        },
        function(newValue, oldValue, scope) {
          scope.counterA++;
        }
      );
      expect(function() {
        scope.$digest();
      }).toThrow();
    });

    it('ends the digest when the last watch is clean', function() {
      scope.array = range(100);
      let watchExecutions = 0;

      times(100, function(i) {
        scope.$watch(
          function(scope) {
            watchExecutions++;

            return scope.array[i];
          },
          function() {}
        );
      });
      scope.$digest();
      expect(watchExecutions).toBe(200);
      scope.array[0] = 420;
      scope.$digest();
      expect(watchExecutions).toBe(301);
    });

    it('does not end digest so that new watches are not run', function() {
      scope.aValue = 'abc';
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.$watch(
            function(scope) {
              return scope.aValue;
            },
            function(newValue, oldValue, scope) {
              scope.counter++;
            }
          );
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('compares based on value if enabled', function() {
      scope.aValue = [1, 2, 3];
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        },
        true
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.aValue.push(4);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('correctly handles NaNs', function() {
      scope.number = 0 / 0; // NaN
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.number;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('catches exceptions in watch functions and continues', function() {
      scope.aValue = 'abc';
      scope.counter = 0;
      scope.$watch(
        function() {
          throw 'Error';
        },
        function() {}
      );
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('catches exceptions in listener functions and continues', function() {
      scope.aValue = 'abc';
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function() {
          throw 'Error';
        }
      );
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('allows destroying a $watch with a removal function', function() {
      scope.aValue = 'abc';
      scope.counter = 0;
      const destroyWatch = scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.aValue = 'def';
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.aValue = 'ghi';
      destroyWatch();
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('allows destroying a $watch during digest', function() {
      scope.aValue = 'abc';
      const watchCalls = [];

      scope.$watch(function(scope) {
        watchCalls.push('first');

        return scope.aValue;
      });
      const destroyWatch = scope.$watch(function() {
        watchCalls.push('second');
        destroyWatch();
      });

      scope.$watch(function(scope) {
        watchCalls.push('third');

        return scope.aValue;
      });
      scope.$digest();
      expect(watchCalls).toEqual(['first', 'second', 'third', 'first', 'third']);
    });

    it('allows a $watch to destroy another during digest', function() {
      scope.aValue = 'abc';
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function() {
          destroyWatch();
        }
      );
      const destroyWatch = scope.$watch(function() {}, function() {});

      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('allows destroying several $watches during digest', function() {
      scope.aValue = 'abc';
      scope.counter = 0;
      const destroyWatch1 = scope.$watch(function() {
        destroyWatch1();
        destroyWatch2();
      });

      const destroyWatch2 = scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(0);
    });
  });

  describe('$eval', function() {
    it('executes $evaled function and returns result', function() {
      scope.aValue = 42;
      const result = scope.$eval(function(scope) {
        return scope.aValue;
      });

      expect(result).toBe(42);
    });

    it('passes the second $eval argument straight through', function() {
      scope.aValue = 42;
      const result = scope.$eval(function(scope, arg) {
        return scope.aValue + arg;
      }, 2);

      expect(result).toBe(44);
    });
  });

  describe('$apply', function() {
    it('executes the given function and starts the digest', function() {
      scope.aValue = 'someValue';
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.$apply(function(scope) {
        scope.aValue = 'someOtherValue';
      });
      expect(scope.counter).toBe(2);
    });
  });

  describe('$evalAsync', function() {
    it('executes given function later in the same cycle', function() {
      scope.aValue = [1, 2, 3];
      scope.asyncEvaluated = false;
      scope.asyncEvaluatedImmediately = false;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.$evalAsync(function(scope) {
            scope.asyncEvaluated = true;
          });
          scope.asyncEvaluatedImmediately = scope.asyncEvaluated;
        }
      );
      scope.$digest();
      expect(scope.asyncEvaluated).toBe(true);
      expect(scope.asyncEvaluatedImmediately).toBe(false);
    });

    it('executes $evalAsynced functions added by watch functions', function() {
      scope.aValue = [1, 2, 3];
      scope.asyncEvaluated = false;
      scope.$watch(
        function(scope) {
          if (!scope.asyncEvaluated) {
            scope.$evalAsync(function(scope) {
              scope.asyncEvaluated = true;
            });
          }

          return scope.aValue;
        },
        function() {}
      );
      scope.$digest();
      expect(scope.asyncEvaluated).toBe(true);
    });

    it('executes $evalAsynced functions even when not dirty', function() {
      scope.aValue = [1, 2, 3];
      scope.asyncEvaluatedTimes = 0;
      scope.$watch(
        function(scope) {
          if (scope.asyncEvaluatedTimes < 2) {
            scope.$evalAsync(function(scope) {
              scope.asyncEvaluatedTimes++;
            });
          }

          return scope.aValue;
        },
        function() {}
      );
      scope.$digest();
      expect(scope.asyncEvaluatedTimes).toBe(2);
    });

    it('eventually halts $evalAsyncs added by watches', function() {
      scope.aValue = [1, 2, 3];
      scope.$watch(
        function(scope) {
          scope.$evalAsync(function() {});

          return scope.aValue;
        },
        function() {}
      );
      expect(function() {
        scope.$digest();
      }).toThrow();
    });

    it('has a $$phase field whose value is the current digest phase', function() {
      scope.aValue = [1, 2, 3];
      scope.phaseInWatchFunction = undefined;
      scope.phaseInListenerFunction = undefined;
      scope.phaseInApplyFunction = undefined;
      scope.$watch(
        function(scope) {
          scope.phaseInWatchFunction = scope.$$phase;

          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.phaseInListenerFunction = scope.$$phase;
        }
      );
      scope.$apply(function(scope) {
        scope.phaseInApplyFunction = scope.$$phase;
      });
      expect(scope.phaseInWatchFunction).toBe('$digest');
      expect(scope.phaseInListenerFunction).toBe('$digest');
      expect(scope.phaseInApplyFunction).toBe('$apply');
    });

    it('schedules a digest in $evalAsync', function(done) {
      scope.aValue = 'abc';
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );

      scope.$evalAsync(function() {});

      expect(scope.counter).toBe(0);

      setTimeout(function() {
        expect(scope.counter).toBe(1);
        done();
      }, 50);
    });

    it('catches exceptions in $evalAsync', function(done) {
      scope.aValue = 'abc';
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$evalAsync(function() {
        throw 'Error';
      });
      setTimeout(function() {
        expect(scope.counter).toBe(1);
        done();
      }, 50);
    });
  });

  describe('$applyAsync', function() {
    it('allows async $apply with $applyAsync', function(done) {
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.$applyAsync(function(scope) {
        scope.aValue = 'abc';
      });

      expect(scope.counter).toBe(1);

      setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
      }, 50);
    });

    it('coalesces many calls to $applyAsync', function(done) {
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          scope.counter++;

          return scope.aValue;
        },
        function() {}
      );
      scope.$applyAsync(function(scope) {
        scope.aValue = 'abc';
      });
      scope.$applyAsync(function(scope) {
        scope.aValue = 'def';
      });

      setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
      }, 50);
    });

    it('cancels and flushes $applyAsync if digested first', function(done) {
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          scope.counter++;

          return scope.aValue;
        },
        function() {}
      );
      scope.$applyAsync(function(scope) {
        scope.aValue = 'abc';
      });
      scope.$applyAsync(function(scope) {
        scope.aValue = 'def';
      });
      scope.$digest();
      expect(scope.counter).toBe(2);
      expect(scope.aValue).toEqual('def');
      setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
      }, 50);
    });

    it('catches exceptions in $applyAsync', function(done) {
      scope.$applyAsync(function() {
        throw 'Error';
      });
      scope.$applyAsync(function() {
        throw 'Error';
      });
      scope.$applyAsync(function(scope) {
        scope.applied = true;
      });
      setTimeout(function() {
        expect(scope.applied).toBe(true);
        done();
      }, 50);
    });
  });

  describe('$postDigest', function() {
    it('runs after each digest', function() {
      scope.counter = 0;
      scope.$$postDigest(function() {
        scope.counter++;
      });
      expect(scope.counter).toBe(0);
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('does not include $$postDigest in the digest', function() {
      scope.aValue = 'original value';
      scope.$$postDigest(function() {
        scope.aValue = 'changed value';
      });
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.watchedValue = newValue;
        }
      );
      scope.$digest();
      expect(scope.watchedValue).toBe('original value');
      scope.$digest();
      expect(scope.watchedValue).toBe('changed value');
    });

    it('catches exceptions in $$postDigest', function() {
      let didRun = false;

      scope.$$postDigest(function() {
        throw 'Error';
      });
      scope.$$postDigest(function() {
        didRun = true;
      });
      scope.$digest();
      expect(didRun).toBe(true);
    });
  });

  describe('$watchGroup', function() {
    it('takes watches as an array and calls listener with arrays', function() {
      let gotNewValues, gotOldValues;

      scope.aValue = 1;
      scope.anotherValue = 2;
      scope.$watchGroup(
        [
          function(scope) {
            return scope.aValue;
          },
          function(scope) {
            return scope.anotherValue;
          }
        ],
        function(newValues, oldValues) {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );
      scope.$digest();
      expect(gotNewValues).toEqual([1, 2]);
      expect(gotOldValues).toEqual([1, 2]);
    });

    it('only calls listener once per digest', function() {
      let counter = 0;

      scope.aValue = 1;
      scope.anotherValue = 2;
      scope.$watchGroup(
        [
          function(scope) {
            return scope.aValue;
          },
          function(scope) {
            return scope.anotherValue;
          }
        ],
        function() {
          counter++;
        }
      );
      scope.$digest();
      expect(counter).toEqual(1);
    });

    it('uses the same array of old and new values on first run', function() {
      let gotNewValues, gotOldValues;

      scope.aValue = 1;
      scope.anotherValue = 2;
      scope.$watchGroup(
        [
          function(scope) {
            return scope.aValue;
          },
          function(scope) {
            return scope.anotherValue;
          }
        ],
        function(newValues, oldValues) {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );
      scope.$digest();
      expect(gotNewValues).toBe(gotOldValues);
    });

    it('uses different arrays for old and new values on subsequent runs', function() {
      let gotNewValues, gotOldValues;

      scope.aValue = 1;
      scope.anotherValue = 2;
      scope.$watchGroup(
        [
          function(scope) {
            return scope.aValue;
          },
          function(scope) {
            return scope.anotherValue;
          }
        ],
        function(newValues, oldValues) {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );
      scope.$digest();
      scope.anotherValue = 3;
      scope.$digest();
      expect(gotNewValues).toEqual([1, 3]);
      expect(gotOldValues).toEqual([1, 2]);
    });

    it('calls the listener once when the watch array is empty', function() {
      let gotNewValues, gotOldValues;

      scope.$watchGroup([], function(newValues, oldValues) {
        gotNewValues = newValues;
        gotOldValues = oldValues;
      });
      scope.$digest();
      expect(gotNewValues).toEqual([]);
      expect(gotOldValues).toEqual([]);
    });

    it('can be deregistered', function() {
      let counter = 0;

      scope.aValue = 1;
      scope.anotherValue = 2;
      const destroyGroup = scope.$watchGroup(
        [
          function(scope) {
            return scope.aValue;
          },
          function(scope) {
            return scope.anotherValue;
          }
        ],
        function() {
          counter++;
        }
      );

      scope.$digest();
      scope.anotherValue = 3;
      destroyGroup();
      scope.$digest();
      expect(counter).toEqual(1);
    });

    it('does not call the zero-watch listener when deregistered first', function() {
      let counter = 0;
      const destroyGroup = scope.$watchGroup([], function() {
        counter++;
      });

      destroyGroup();
      scope.$digest();
      expect(counter).toEqual(0);
    });
  });

  describe('inheritance', function() {
    it('inherits the parents properties', function() {
      const parent = new Scope();

      parent.aValue = [1, 2, 3];
      const child = parent.$new();

      expect(child.aValue).toEqual([1, 2, 3]);
    });

    it('does not cause a parent to inherit its properties', function() {
      const parent = new Scope();
      const child = parent.$new();

      child.aValue = [1, 2, 3];
      expect(parent.aValue).toBeUndefined();
    });

    it('inherits the parents properties whenever they are defined', function() {
      const parent = new Scope();
      const child = parent.$new();

      parent.aValue = [1, 2, 3];
      expect(child.aValue).toEqual([1, 2, 3]);
    });

    it('can manipulate a parent scopes property', function() {
      const parent = new Scope();
      const child = parent.$new();

      parent.aValue = [1, 2, 3];
      child.aValue.push(4);
      expect(child.aValue).toEqual([1, 2, 3, 4]);
      expect(parent.aValue).toEqual([1, 2, 3, 4]);
    });

    it('can watch a property in the parent', function() {
      const parent = new Scope();
      const child = parent.$new();

      parent.aValue = [1, 2, 3];
      child.counter = 0;
      child.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        },
        true
      );
      child.$digest();
      expect(child.counter).toBe(1);
      parent.aValue.push(4);
      child.$digest();
      expect(child.counter).toBe(2);
    });

    it('can be nested at any depth', function() {
      const a = new Scope();
      const aa = a.$new();
      const aaa = aa.$new();
      const aab = aa.$new();
      const ab = a.$new();
      const abb = ab.$new();

      a.value = 1;
      expect(aa.value).toBe(1);
      expect(aaa.value).toBe(1);
      expect(aab.value).toBe(1);
      expect(ab.value).toBe(1);
      expect(abb.value).toBe(1);
      ab.anotherValue = 2;
      expect(abb.anotherValue).toBe(2);
      expect(aa.anotherValue).toBeUndefined();
      expect(aaa.anotherValue).toBeUndefined();
    });

    it('shadows a parents property with the same name', function() {
      const parent = new Scope();
      const child = parent.$new();

      parent.name = 'Joe';
      child.name = 'Jill';
      expect(child.name).toBe('Jill');
      expect(parent.name).toBe('Joe');
    });

    it('does not shadow members of parent scopes attributes', function() {
      const parent = new Scope();
      const child = parent.$new();

      parent.user = { name: 'Joe' };
      child.user.name = 'Jill';
      expect(child.user.name).toBe('Jill');
      expect(parent.user.name).toBe('Jill');
    });

    it('does not digest its parent(s)', function() {
      const parent = new Scope();
      const child = parent.$new();

      parent.aValue = 'abc';
      parent.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.aValueWas = newValue;
        }
      );
      child.$digest();
      expect(child.aValueWas).toBeUndefined();
    });

    it('keeps a record of its children', function() {
      const parent = new Scope();
      const child1 = parent.$new();
      const child2 = parent.$new();
      const child2_1 = child2.$new();

      expect(parent.$$children.length).toBe(2);
      expect(parent.$$children[0]).toBe(child1);
      expect(parent.$$children[1]).toBe(child2);
      expect(child1.$$children.length).toBe(0);
      expect(child2.$$children.length).toBe(1);
      expect(child2.$$children[0]).toBe(child2_1);
    });

    it('digests its children', function() {
      const parent = new Scope();
      const child = parent.$new();

      parent.aValue = 'abc';

      child.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.aValueWas = newValue;
        }
      );
      parent.$digest();
      expect(child.aValueWas).toBe('abc');
    });

    it('digests from root on $apply', function() {
      const parent = new Scope();
      const child = parent.$new();
      const child2 = child.$new();

      parent.aValue = 'abc';
      parent.counter = 0;
      parent.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      child2.$apply(function() {});
      expect(parent.counter).toBe(1);
    });

    it('schedules a digest from root on $evalAsync', function(done) {
      const parent = new Scope();
      const child = parent.$new();
      const child2 = child.$new();

      parent.aValue = 'abc';
      parent.counter = 0;
      parent.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      child2.$evalAsync(function() {});
      setTimeout(function() {
        expect(parent.counter).toBe(1);
        done();
      }, 50);
    });

    it('does not have access to parent attributes when isolated', function() {
      const parent = new Scope();
      const child = parent.$new(true);

      parent.aValue = 'abc';
      expect(child.aValue).toBeUndefined();
    });

    it('cannot watch parent attributes when isolated', function() {
      const parent = new Scope();
      const child = parent.$new(true);

      parent.aValue = 'abc';
      child.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.aValueWas = newValue;
        }
      );
      child.$digest();
      expect(child.aValueWas).toBeUndefined();
    });

    it('digests its isolated children', function() {
      const parent = new Scope();
      const child = parent.$new(true);

      child.aValue = 'abc';
      child.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.aValueWas = newValue;
        }
      );
      parent.$digest();
      expect(child.aValueWas).toBe('abc');
    });

    it('digests from root on $apply when isolated', function() {
      const parent = new Scope();
      const child = parent.$new(true);
      const child2 = child.$new();

      parent.aValue = 'abc';
      parent.counter = 0;
      parent.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      child2.$apply(function() {});
      expect(parent.counter).toBe(1);
    });

    it('schedules a digest from root on $evalAsync when isolated', function(done) {
      const parent = new Scope();
      const child = parent.$new(true);
      const child2 = child.$new();

      parent.aValue = 'abc';
      parent.counter = 0;
      parent.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      child2.$evalAsync(function() {});
      setTimeout(function() {
        expect(parent.counter).toBe(1);
        done();
      }, 50);
    });

    it('executes $evalAsync functions on isolated scopes', function(done) {
      const parent = new Scope();
      const child = parent.$new(true);

      child.$evalAsync(function(scope) {
        scope.didEvalAsync = true;
      });
      setTimeout(function() {
        expect(child.didEvalAsync).toBe(true);
        done();
      }, 50);
    });

    it('executes $$postDigest functions on isolated scopes', function() {
      const parent = new Scope();
      const child = parent.$new(true);

      child.$$postDigest(function() {
        child.didPostDigest = true;
      });
      parent.$digest();
      expect(child.didPostDigest).toBe(true);
    });

    it('executes $applyAsync functions on isolated scopes', function() {
      const parent = new Scope();
      const child = parent.$new(true);
      let applied = false;

      parent.$applyAsync(function() {
        applied = true;
      });
      child.$digest();
      expect(applied).toBe(true);
    });

    it('can take some other scope as the parent', function() {
      const prototypeParent = new Scope();
      const hierarchyParent = new Scope();
      const child = prototypeParent.$new(false, hierarchyParent);

      prototypeParent.a = 42;
      expect(child.a).toBe(42);
      child.counter = 0;
      child.$watch(function(scope) {
        scope.counter++;
      });
      prototypeParent.$digest();
      expect(child.counter).toBe(0);
      hierarchyParent.$digest();
      expect(child.counter).toBe(2);
    });

    it('is no longer digested when $destroy has been called', function() {
      const parent = new Scope();
      const child = parent.$new();

      child.aValue = [1, 2, 3];
      child.counter = 0;
      child.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        },
        true
      );
      parent.$digest();
      expect(child.counter).toBe(1);
      child.aValue.push(4);
      parent.$digest();
      expect(child.counter).toBe(2);
      child.$destroy();
      child.aValue.push(5);
      parent.$digest();
      expect(child.counter).toBe(2);
    });
  });

  describe('$watchCollection', function() {
    it('works like a normal watch for non-collections', function() {
      let valueProvided;

      scope.aValue = 42;
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          valueProvided = newValue;
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);

      expect(valueProvided).toBe(scope.aValue);
      scope.aValue = 43;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('works like a normal watch for NaNs', function() {
      scope.aValue = 0 / 0;
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('notices when the value becomes an array', function() {
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.arr;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr = [1, 2, 3];
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices an item added to an array', function() {
      scope.arr = [1, 2, 3];
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.arr;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr.push(4);
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices an item removed from an array', function() {
      scope.arr = [1, 2, 3];
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.arr;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr.shift();
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices an item replaced in an array', function() {
      scope.arr = [1, 2, 3];
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.arr;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr[1] = 42;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices items reordered in an array', function() {
      scope.arr = [2, 1, 3];
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.arr;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr.sort();
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('does not fail on NaNs in arrays', function() {
      scope.arr = [2, NaN, 3];
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.arr;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('notices an item replaced in an arguments object', function() {
      (function() {
        scope.arrayLike = arguments;
      })(1, 2, 3);
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.arrayLike;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arrayLike[1] = 42;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices an item replaced in a NodeList object', function() {
      document.documentElement.appendChild(document.createElement('div'));
      scope.arrayLike = document.getElementsByTagName('div');
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.arrayLike;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      document.documentElement.appendChild(document.createElement('div'));
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices when the value becomes an object', function() {
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.obj;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.obj = { a: 1 };
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices when an attribute is added to an object', function() {
      scope.counter = 0;
      scope.obj = { a: 1 };
      scope.$watchCollection(
        function(scope) {
          return scope.obj;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.obj.b = 2;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices when an attribute is changed in an object', function() {
      scope.counter = 0;
      scope.obj = { a: 1 };
      scope.$watchCollection(
        function(scope) {
          return scope.obj;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.obj.a = 2;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('does not fail on NaN attributes in objects', function() {
      scope.counter = 0;
      scope.obj = { a: NaN };
      scope.$watchCollection(
        function(scope) {
          return scope.obj;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('notices when an attribute is removed from an object', function() {
      scope.counter = 0;
      scope.obj = { a: 1 };
      scope.$watchCollection(
        function(scope) {
          return scope.obj;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      delete scope.obj.a;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('does not consider any object with a length property an array', function() {
      scope.obj = {
        length: 42,
        otherKey: 'abc'
      };
      scope.counter = 0;
      scope.$watchCollection(
        function(scope) {
          return scope.obj;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      scope.obj.newKey = 'def';
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('gives the old non-collection value to listeners', function() {
      scope.aValue = 42;
      let oldValueGiven;

      scope.$watchCollection(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue) {
          oldValueGiven = oldValue;
        }
      );
      scope.$digest();
      scope.aValue = 43;
      scope.$digest();
      expect(oldValueGiven).toBe(42);
    });

    it('gives the old array value to listeners', function() {
      scope.aValue = [1, 2, 3];
      let oldValueGiven;

      scope.$watchCollection(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue) {
          oldValueGiven = oldValue;
        }
      );
      scope.$digest();
      scope.aValue.push(4);
      scope.$digest();
      expect(oldValueGiven).toEqual([1, 2, 3]);
    });

    it('gives the old object value to listeners', function() {
      scope.aValue = {
        a: 1,
        b: 2
      };
      let oldValueGiven;

      scope.$watchCollection(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue) {
          oldValueGiven = oldValue;
        }
      );
      scope.$digest();
      scope.aValue.c = 3;
      scope.$digest();
      expect(oldValueGiven).toEqual({
        a: 1,
        b: 2
      });
    });

    it('uses the new value as the old value on first digest', function() {
      let oldValueGiven;

      scope.aValue = {
        a: 1,
        b: 2
      };

      scope.$watchCollection(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue) {
          oldValueGiven = oldValue;
        }
      );

      scope.$digest();

      expect(oldValueGiven).toEqual({
        a: 1,
        b: 2
      });
    });
  });

  describe('Events', function() {
    let parent;
    let scope;
    let child;
    let isolatedChild;

    beforeEach(function() {
      parent = new Scope();
      scope = parent.$new();
      child = scope.$new();
      isolatedChild = scope.$new(true);
    });

    it('allows registering listeners', function() {
      const listener1 = function() {};
      const listener2 = function() {};
      const listener3 = function() {};

      scope.$on('someEvent', listener1);
      scope.$on('someEvent', listener2);
      scope.$on('someOtherEvent', listener3);
      expect(scope.$$listeners).toEqual({
        someEvent: [listener1, listener2],
        someOtherEvent: [listener3]
      });
    });

    it('registers different listeners for every scope', function() {
      const listener1 = function() {};
      const listener2 = function() {};
      const listener3 = function() {};

      scope.$on('someEvent', listener1);
      child.$on('someEvent', listener2);
      isolatedChild.$on('someEvent', listener3);
      expect(scope.$$listeners).toEqual({ someEvent: [listener1] });
      expect(child.$$listeners).toEqual({ someEvent: [listener2] });
      expect(isolatedChild.$$listeners).toEqual({ someEvent: [listener3] });
    });

    forEach(['$emit', '$broadcast'], function(method) {
      it(`calls listeners registered for matching events on ${method}`, function() {
        const listener1 = jest.fn();
        const listener2 = jest.fn();

        scope.$on('someEvent', listener1);
        scope.$on('someOtherEvent', listener2);
        scope[method]('someEvent');
        expect(listener1).toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
      });

      it(`passes an event object with a namae to listeners on ${method}`, function() {
        const listener = jest.fn();

        scope.$on('someEvent', listener);
        scope[method]('someEvent');
        expect(listener).toHaveBeenCalled();
        expect(listener.mock.calls[listener.mock.calls.length - 1][0].name).toEqual('someEvent');
      });

      it(`passes additional arguments to listeners on ${method}`, function() {
        const listener = jest.fn();

        scope.$on('someEvent', listener);
        scope[method]('someEvent', 'and', ['additional', 'arguments'], '...');
        expect(listener.mock.calls[listener.mock.calls.length - 1][1]).toEqual('and');
        expect(listener.mock.calls[listener.mock.calls.length - 1][2]).toEqual(['additional', 'arguments']);
        expect(listener.mock.calls[listener.mock.calls.length - 1][3]).toEqual('...');
      });

      it(`returns the event object on ${method}`, function() {
        const returnedEvent = scope[method]('someEvent');

        expect(returnedEvent).toBeDefined();
        expect(returnedEvent.name).toEqual('someEvent');
      });

      it(`can be deregistered ${method}`, function() {
        const listener = jest.fn();
        const deregister = scope.$on('someEvent', listener);

        deregister();
        scope[method]('someEvent');
        expect(listener).not.toHaveBeenCalled();
      });

      it(`does not skip the next listener when removed on ${method}`, function() {
        let deregister;
        const listener = function() {
          deregister();
        };
        const nextListener = jest.fn();

        deregister = scope.$on('someEvent', listener);
        scope.$on('someEvent', nextListener);
        scope[method]('someEvent');
        expect(nextListener).toHaveBeenCalled();
      });

      it(`does not stop on exceptions on ${method}`, function() {
        const listener1 = function() {
          throw 'listener1 throwing an exception';
        };
        const listener2 = jest.fn();

        scope.$on('someEvent', listener1);
        scope.$on('someEvent', listener2);
        scope[method]('someEvent');
        expect(listener2).toHaveBeenCalled();
      });
    });

    it('propagates up the scope hierarchy on $emit', function() {
      const parentListener = jest.fn();
      const scopeListener = jest.fn();

      parent.$on('someEvent', parentListener);
      scope.$on('someEvent', scopeListener);
      scope.$emit('someEvent');
      expect(scopeListener).toHaveBeenCalled();
      expect(parentListener).toHaveBeenCalled();
    });

    it('propagates the same event up on $emit', function() {
      const parentListener = jest.fn();
      const scopeListener = jest.fn();

      parent.$on('someEvent', parentListener);
      scope.$on('someEvent', scopeListener);
      scope.$emit('someEvent');
      const scopeEvent = scopeListener.mock.calls[scopeListener.mock.calls.length - 1][0];
      const parentEvent = parentListener.mock.calls[parentListener.mock.calls.length - 1][0];

      expect(scopeEvent).toBe(parentEvent);
    });

    it('propagates down the scope hierarchy on $broadcast', function() {
      const scopeListener = jest.fn();
      const childListener = jest.fn();
      const isolatedChildListener = jest.fn();

      scope.$on('someEvent', scopeListener);
      child.$on('someEvent', childListener);
      isolatedChild.$on('someEvent', isolatedChildListener);
      scope.$broadcast('someEvent');
      expect(scopeListener).toHaveBeenCalled();
      expect(childListener).toHaveBeenCalled();
      expect(isolatedChildListener).toHaveBeenCalled();
    });

    it('attaches targetScope on $emit', function() {
      const scopeListener = jest.fn();
      const parentListener = jest.fn();

      scope.$on('someEvent', scopeListener);
      parent.$on('someEvent', parentListener);
      scope.$emit('someEvent');
      expect(scopeListener.mock.calls[scopeListener.mock.calls.length - 1][0].targetScope).toBe(scope);
      expect(parentListener.mock.calls[parentListener.mock.calls.length - 1][0].targetScope).toBe(scope);
    });

    it('attaches targetScope on $broadcast', function() {
      const scopeListener = jest.fn();
      const childListener = jest.fn();

      scope.$on('someEvent', scopeListener);
      child.$on('someEvent', childListener);
      scope.$broadcast('someEvent');
      expect(scopeListener.mock.calls[scopeListener.mock.calls.length - 1][0].targetScope).toBe(scope);
      expect(childListener.mock.calls[childListener.mock.calls.length - 1][0].targetScope).toBe(scope);
    });

    it('attaches currentScope on $emit', function() {
      let currentScopeOnParent, currentScopeOnScope;
      const scopeListener = function(event) {
        currentScopeOnScope = event.currentScope;
      };
      const parentListener = function(event) {
        currentScopeOnParent = event.currentScope;
      };

      scope.$on('someEvent', scopeListener);
      parent.$on('someEvent', parentListener);
      scope.$emit('someEvent');
      expect(currentScopeOnScope).toBe(scope);
      expect(currentScopeOnParent).toBe(parent);
    });

    it('attaches currentScope on $broadcast', function() {
      let currentScopeOnChild, currentScopeOnScope;
      const scopeListener = function(event) {
        currentScopeOnScope = event.currentScope;
      };
      const childListener = function(event) {
        currentScopeOnChild = event.currentScope;
      };

      scope.$on('someEvent', scopeListener);
      child.$on('someEvent', childListener);
      scope.$broadcast('someEvent');
      expect(currentScopeOnScope).toBe(scope);
      expect(currentScopeOnChild).toBe(child);
    });

    it('sets currentScope to null after propagation on $emit', function() {
      let event;
      const scopeListener = function(evt) {
        event = evt;
      };

      scope.$on('someEvent', scopeListener);
      scope.$emit('someEvent');
      expect(event.currentScope).toBe(null);
    });

    it('sets currentScope to null after propagation on $broadcast', function() {
      let event;
      const scopeListener = function(evt) {
        event = evt;
      };

      scope.$on('someEvent', scopeListener);
      scope.$broadcast('someEvent');
      expect(event.currentScope).toBe(null);
    });

    it('does not propagate to parents when stopped', function() {
      const scopeListener = function(event) {
        event.stopPropagation();
      };
      const parentListener = jest.fn();

      scope.$on('someEvent', scopeListener);
      parent.$on('someEvent', parentListener);
      scope.$emit('someEvent');
      expect(parentListener).not.toHaveBeenCalled();
    });

    it('is received by listeners on current scope after being stopped', function() {
      const listener1 = function(event) {
        event.stopPropagation();
      };
      const listener2 = jest.fn();

      scope.$on('someEvent', listener1);
      scope.$on('someEvent', listener2);
      scope.$emit('someEvent');
      expect(listener2).toHaveBeenCalled();
    });

    it('fires $destroy when destroyed', function() {
      const listener = jest.fn();

      scope.$on('$destroy', listener);
      scope.$destroy();
      expect(listener).toHaveBeenCalled();
    });

    it('fires $destroy on children destroyed', function() {
      const listener = jest.fn();

      child.$on('$destroy', listener);
      scope.$destroy();
      expect(listener).toHaveBeenCalled();
    });

    it('no longer calls listeners after destroyed', function() {
      const listener = jest.fn();

      scope.$on('myEvent', listener);
      scope.$destroy();
      scope.$emit('myEvent');
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
