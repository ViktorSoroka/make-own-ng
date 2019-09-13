import { parse } from '../src/parse';

describe('parse', function() {
  it('can parse an integer', function() {
    const fn = parse('42');

    expect(fn).toBeDefined();
    expect(fn()).toBe(42);
  });

  it('can parse a floating point number', function() {
    const fn = parse('4.2');

    expect(fn()).toBe(4.2);
  });

  it('can parse a floating point number without an integer part', function() {
    const fn = parse('.42');

    expect(fn()).toBe(0.42);
  });

  it('can parse a number in scientific notation', function() {
    const fn = parse('42e3');

    expect(fn()).toBe(42000);
  });

  it('can parse scientific notation with a float coefficient', function() {
    const fn = parse('.42e2');

    expect(fn()).toBe(42);
  });

  it('can parse scientific notation with negative exponents', function() {
    const fn = parse('4200e-2');

    expect(fn()).toBe(42);
  });

  it('can parse scientific notation with the + sign', function() {
    const fn = parse('.42e+2');

    expect(fn()).toBe(42);
  });

  it('can parse upper case scientific notation', function() {
    const fn = parse('.42E2');

    expect(fn()).toBe(42);
  });

  it('will not parse invalid scientific notation', function() {
    expect(function() {
      parse('42e-');
    }).toThrow();

    expect(function() {
      parse('42e-a');
    }).toThrow();

    expect(function() {
      parse('42e');
    }).toThrow();
  });

  it('can parse a string in single quotes', function() {
    const fn = parse("'abc'");

    expect(fn()).toEqual('abc');
  });

  it('can parse a string in double quotes', function() {
    const fn = parse('"abc"');

    expect(fn()).toEqual('abc');
  });

  it('will not parse a string with mismatching quotes', function() {
    expect(function() {
      parse('"abc\'');
    }).toThrow();
  });

  it('can parse a string with single quotes inside', function() {
    const fn = parse("'a\\'b'");

    expect(fn()).toEqual("a'b");
  });

  it('can parse a string with double quotes inside', function() {
    const fn = parse('"a\\"b"');

    expect(fn()).toEqual('a"b');
  });

  it('will parse a string with unicode escapes', function() {
    const fn = parse('"\\u00A0"');

    expect(fn()).toEqual('\u00A0');
  });

  it('will not parse a string with invalid unicode escapes', function() {
    expect(function() {
      parse('"\\u00T0"');
    }).toThrow();
  });

  it('will parse null', function() {
    const fn = parse('null');

    expect(fn()).toBe(null);
  });

  it('will parse true', function() {
    const fn = parse('true');

    expect(fn()).toBe(true);
  });

  it('will parse false', function() {
    const fn = parse('false');

    expect(fn()).toBe(false);
  });

  it('ignores whitespace', function() {
    const fn = parse(' \n42 ');

    expect(fn()).toEqual(42);
  });

  it('will parse an empty array', function() {
    const fn = parse('[]');

    expect(fn()).toEqual([]);
  });

  it('will parse a non-empty array', function() {
    const fn = parse('[1, "two", [3], true]');

    expect(fn()).toEqual([1, 'two', [3], true]);
  });

  it('will parse an array with trailing commas', function() {
    const fn = parse('[1, ]');

    expect(fn()).toEqual([1]);
  });

  it('will parse an empty object', function() {
    const fn = parse('{}');

    expect(fn()).toEqual({});
  });

  it('will parse a non-empty object', function() {
    const fn = parse('{"a key": 1, \'another-key\': 2}');

    expect(fn()).toEqual({
      'a key': 1,
      'another-key': 2
    });
  });

  it('will parse an object with identifier keys', function() {
    const fn = parse('{a: 1, b: [2, 3], c: {d: 4}}');

    expect(fn()).toEqual({
      a: 1,
      b: [2, 3],
      c: { d: 4 }
    });
  });
});
