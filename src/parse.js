import {
  map,
  bind,
  isNull,
  isString
} from 'lodash';

const ESCAPES = {
  n: '\n',
  f: '\f',
  r: '\r',
  t: '\t',
  v: '\v',
  "'": "'",
  '"': '"'
};

export function parse(expr) {
  const lexer = new Lexer();
  const parser = new Parser(lexer);

  return parser.parse(expr);
}

function Lexer() {}

Lexer.prototype.lex = function(text) {
  this.text = text;
  this.index = 0; // Our current character index in the string
  this.ch = undefined; // The current character
  this.tokens = []; // The resulting collection of tokens.

  while (this.index < this.text.length) {
    this.ch = this.text.charAt(this.index);

    if (this.isNumber(this.ch) || (this.ch === '.' && this.isNumber(this.peek()))) {
      this.readNumber();
    } else if (this.is('\'"')) {
      this.readString(this.ch);
    } else if (this.is('[],{}:')) {
      this.tokens.push({ text: this.ch });
      this.index++;
    } else if (this.isIdent(this.ch)) {
      this.readIdent();
    } else if (this.isWhitespace(this.ch)) {
      this.index++;
    } else {
      throw `Unexpected next character: ${this.ch}`;
    }
  }

  return this.tokens;
};

Lexer.prototype.is = function(chs) {
  return chs.indexOf(this.ch) >= 0;
};

Lexer.prototype.isNumber = function(ch) {
  return typeof ch !== 'boolean' && '0' <= ch && ch <= '9';
};

Lexer.prototype.isExpOperator = function(ch) {
  return ch === '-' || ch === '+' || this.isNumber(ch);
};

Lexer.prototype.isIdent = function(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
};

Lexer.prototype.isWhitespace = function(ch) {
  return ch === ' ' || ch === '\r' || ch === '\t' || ch === '\n' || ch === '\v' || ch === '\u00A0';
};

Lexer.prototype.peek = function() {
  return this.index < this.text.length - 1 ? this.text.charAt(this.index + 1) : false;
};

Lexer.prototype.readNumber = function() {
  let number = '';

  while (this.index < this.text.length) {
    const ch = this.text.charAt(this.index).toLowerCase();

    if (ch === '.' || this.isNumber(ch)) {
      number += ch;
    } else {
      const nextCh = this.peek();
      const prevCh = number.charAt(number.length - 1);

      if (ch === 'e' && this.isExpOperator(nextCh)) {
        number += ch;
      } else if (this.isExpOperator(ch) && prevCh === 'e' && nextCh && this.isNumber(nextCh)) {
        number += ch;
      } else if (
        (this.isExpOperator(ch) && prevCh === 'e' && (!nextCh || !this.isNumber(nextCh))) ||
        (ch === 'e' && !this.isExpOperator(nextCh))
      ) {
        throw 'Invalid exponent';
      } else {
        break;
      }
    }
    this.index++;
  }

  this.tokens.push({
    text: number,
    value: Number(number)
  });
};

Lexer.prototype.readString = function(quote) {
  this.index++;

  let string = '';
  let escape = false;

  while (this.index < this.text.length) {
    const ch = this.text.charAt(this.index);

    if (escape) {
      if (ch === 'u') {
        const hex = this.text.substring(this.index + 1, this.index + 5);

        if (!hex.match(/[\da-f]{4}/i)) {
          throw 'Invalid unicode escape';
        }
        this.index += 4;
        string += String.fromCharCode(parseInt(hex, 16));
      } else {
        const replacement = ESCAPES[ch];

        if (replacement) {
          string += replacement;
        } else {
          string += ch;
        }
      }
      escape = false;
    } else if (ch === quote) {
      this.index++;
      this.tokens.push({
        text: string,
        value: string
      });

      return;
    } else if (ch === '\\') {
      escape = true;
    } else {
      string += ch;
    }
    this.index++;
  }
  throw 'Unmatched quote';
};

Lexer.prototype.readIdent = function() {
  let text = '';

  while (this.index < this.text.length) {
    const ch = this.text.charAt(this.index);

    if (this.isIdent(ch) || this.isNumber(ch)) {
      text += ch;
    } else {
      break;
    }

    this.index++;
  }

  const token = {
    text: text,
    identifier: true
  };

  this.tokens.push(token);
};

function AST(lexer) {
  this.lexer = lexer;
}

AST.Program = 'Program';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.ObjectExpression = 'ObjectExpression';
AST.Property = 'Property';
AST.Identifier = 'Identifier';

AST.prototype.ast = function(text) {
  this.tokens = this.lexer.lex(text);

  return this.program();
};

AST.prototype.program = function() {
  return {
    type: AST.Program,
    body: this.primary()
  };
};

AST.prototype.primary = function() {
  if (this.expect('[')) {
    return this.arrayDeclaration();
  } else if (this.expect('{')) {
    return this.object();
  } else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
    return this.constants[this.consume().text];
  }

  return this.constant();
};

AST.prototype.constant = function() {
  return {
    type: AST.Literal,
    value: this.consume().value
  };
};

AST.prototype.constants = {
  null: {
    type: AST.Literal,
    value: null
  },
  true: {
    type: AST.Literal,
    value: true
  },
  false: {
    type: AST.Literal,
    value: false
  }
};

AST.prototype.expect = function(e) {
  const token = this.peek(e);

  if (token) {
    return this.tokens.shift();
  }
};

AST.prototype.peek = function(e) {
  if (this.tokens.length > 0) {
    const text = this.tokens[0].text;

    if (text === e || !e) {
      return this.tokens[0];
    }
  }
};

AST.prototype.arrayDeclaration = function() {
  const elements = [];

  if (!this.peek(']')) {
    do {
      if (this.peek(']')) {
        break;
      }
      elements.push(this.primary());
    } while (this.expect(','));
  }

  this.consume(']');

  return {
    type: AST.ArrayExpression,
    elements: elements
  };
};

AST.prototype.object = function() {
  const properties = [];

  if (!this.peek('}')) {
    do {
      const property = { type: AST.Property };

      if (this.peek().identifier) {
        property.key = this.identifier();
      } else {
        property.key = this.constant();
      }

      this.consume(':');
      property.value = this.primary();

      properties.push(property);
    } while (this.expect(','));
  }

  this.consume('}');

  return {
    type: AST.ObjectExpression,
    properties: properties
  };
};

AST.prototype.identifier = function() {
  return {
    type: AST.Identifier,
    name: this.consume().text
  };
};

AST.prototype.consume = function(e) {
  const token = this.expect(e);

  if (!token) {
    throw `Unexpected. Expecting: ${e}`;
  }

  return token;
};

function ASTCompiler(astBuilder) {
  this.astBuilder = astBuilder;
}

ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;

ASTCompiler.prototype.stringEscapeFn = function(c) {
  return `\\u${`0000${c.charCodeAt(0).toString(16)}`.slice(-4)}`;
};

ASTCompiler.prototype.compile = function(text) {
  const ast = this.astBuilder.ast(text);

  this.state = { body: [] };
  this.recurse(ast);

  /* jshint -W054 */
  return new Function(this.state.body.join(''));
  /* jshint +W054 */
};

ASTCompiler.prototype.recurse = function(ast) {
  switch (ast.type) {
    case AST.Program:
      this.state.body.push('return ', this.recurse(ast.body), ';');
      break;
    case AST.Literal:
      return this.escape(ast.value);
    case AST.ArrayExpression:
      const elements = map(
        ast.elements,
        bind(function(element) {
          return this.recurse(element);
        }, this)
      );

      return `[${elements.join(',')}]`;
    case AST.ObjectExpression:
      var properties = map(
        ast.properties,
        bind(function(property) {
          const key = property.key.type === AST.Identifier ? property.key.name : this.escape(property.key.value);

          const value = this.recurse(property.value);

          return `${key}:${value}`;
        }, this)
      );

      return `{${properties.join(',')}}`;
  }
};

ASTCompiler.prototype.escape = function(value) {
  if (isString(value)) {
    return `'${value.replace(this.stringEscapeRegex, this.stringEscapeFn)}'`;
  } else if (isNull(value)) {
    return 'null';
  }

  return value;
};

export default function Parser(lexer) {
  this.lexer = lexer;
  this.ast = new AST(this.lexer);
  this.astCompiler = new ASTCompiler(this.ast);
}

Parser.prototype.parse = function(text) {
  return this.astCompiler.compile(text);
};
