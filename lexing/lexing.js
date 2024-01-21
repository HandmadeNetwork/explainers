// See Annex A.1 of the C spec:
// https://www.open-std.org/jtc1/sc22/WG14/www/docs/n1256.pdf

const input = document.querySelector("#input");
const results = document.querySelector("#results");

const keywords = [
    "auto", "break", "case", "char", "const", "continue", "default", "double",
    "do", "else", "enum", "extern", "float", "for", "goto", "if", "inline",
    "int", "long", "register", "restrict", "return", "short", "signed",
    "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned",
    "void", "volatile", "while", "_Bool", "_Complex", "_Imaginary",
];

let source;
let cur;
let line, col;
let eof;

function lex() {
    source = input.value;
    cur = 0;
    line = 1;
    col = 1;
    eof = false;

    if (source.length === 0) {
        return;
    }

    console.log("starting lex");
    while (!eof) {
        consumeWhitespaceAndComments();

        const keyword = lexKeyword();
        if (keyword) {
            console.log("keyword", keyword);
            continue;
        }

        const char = lexCharacterConstant();
        if (char) {
            console.log("char", char);
            continue;
        }

        const str = lexStringLiteral();
        if (str) {
            console.log("string", str);
            continue;
        }

        const identifier = lexIdentifier();
        if (identifier) {
            console.log("identifier", identifier);
            continue;
        }

        const floating = lexFloatingConstant();
        if (floating) {
            console.log("floating", floating);
            continue;
        }

        const integer = lexIntegerConstant();
        if (integer) {
            console.log("integer", integer);
            continue;
        }

        throw new Error("failed to lex, bad token");
    }
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg)
    }
}

function rest() {
    return source.substring(cur);
}

function bumpCur() {
    if (cur >= source.length) {
        eof = true;
        return;
    }

    if (source.substring(cur, cur+1) === "\n") {
        line += 1;
        col = 1;
    } else {
        col += 1;
    }
    cur += 1;
}

function advanceBy(n) {
    for (let i = 0; i < n && !eof; i++) {
        bumpCur();
    }
}

function nextIs(s) {
    if (s instanceof RegExp) {
        return !!rest().match(s);
    } else {
        return rest().length >= s.length && rest().substring(0, s.length) == s;
    }
}

function consume(s) {
    assert(nextIs(s), `expected to consume "${s}" but saw "${rest().substring(0, s.length)}" instead`);
    return advanceBy(s.length);
}

function consumeIfMatch(r) {
    assert(r.source[0] === "^", `regexp /${r.source}/ was not anchored to the start of the string!`);
    if (nextIs(r)) {
        const m = rest().match(r);
        consume(m[0]);
        return m[0];
    }
    return null;
}

function consumeWhitespaceAndComments() {
    while (!eof) {
        switch (source.substring(cur, cur+1)) {
            case " ":
            case "\f":
            case "\n":
            case "\r":
            case "\t":
            case "\v": {
                bumpCur();
            } break;
            case "/": {
                if (nextIs("//")) {
                    consume("//");
                    while (!eof) {
                        const done = nextIs("\n");
                        bumpCur();
                        if (done) {
                            break;
                        }
                    }
                } else if (nextIs("/*")) {
                    consume("/*");
                    while (!eof) {
                        if (nextIs("*/")) {
                            consume("*/");
                            break;
                        } else {
                            bumpCur();
                        }
                    }
                } else {
                    return;
                }
            } break;
            default: return;
        }
    }
}

function lexKeyword() {
    for (const keyword of keywords) {
        if (nextIs(keyword)) {
            consume(keyword);
            return { type: "keyword", keyword: keyword };
        }
    }
    return null;
}

function lexIdentifier() {
    // TODO: universal-character-name, I guess, bleh
    const ident = consumeIfMatch(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (ident) {
        return { type: "identifier", name: ident };
    }
    return null;
}

function lexIntegerConstant() {
    const constant = lexIntegerConstantNoSuffix();
    if (constant) {
        lexIntegerSuffix(constant);
        return constant;
    }
    return null;
}

function lexIntegerConstantNoSuffix() {
    const decimal = consumeIfMatch(/^[1-9][0-9]*/);
    if (decimal) {
        return { type: "integer", subtype: "decimal", value: decimal };
    }

    const hex = consumeIfMatch(/^0[xX][0-9a-fA-F]*/);
    if (hex) {
        return { type: "integer", subtype: "hex", value: hex };
    }

    const octal = consumeIfMatch(/^0[0-7]*/);
    if (octal) {
        return { type: "integer", subtype: "octal", value: octal };
    }

    return null;
}

function lexIntegerSuffix(integer) {
    integer.unsigned = false;
    integer.longth = null;

    // Unsigned and longth are both optional and can appear in either order.
    lexIntegerLongth(integer);
    lexIntegerUnsigned(integer);
    if (integer.longth === null) {
        lexIntegerLongth(integer);
    }

    if (integer.longth === null) {
        integer.longth = 0;
    }
}

function lexIntegerLongth(integer) {
    const longlong = consumeIfMatch(/^(ll|LL)/);
    if (longlong) {
        integer.value += longlong;
        integer.longth = 2;
        return;
    }
    
    const long = consumeIfMatch(/^[lL]/);
    if (long) {
        integer.value += long;
        integer.longth = 1;
        return;
    }
}

function lexIntegerUnsigned(integer) {
    const unsigned = consumeIfMatch(/^[uU]/);
    if (unsigned) {
        integer.value += unsigned;
        integer.unsigned = !!unsigned;
    }
}

const reDecimalFloat = /^(([0-9]*\.[0-9]+|[0-9]+\.)([eE][+-]?[0-9]+)?[flFL]?|[0-9]+([eE][+-]?[0-9]+)[flFL]?)/;
const reHexFloat = /^0[xX](([0-9a-fA-F]*\.[0-9a-fA-F]+|[0-9a-fA-F]+\.)|[0-9a-fA-F]+)[pP][+-]?[0-9]+[flFL]?/;

function lexFloatingConstant() {
    // First do a big regex validation so that we bail early without consuming
    // anything if it's not actually a float. We need to leave chars in the
    // string for lexing integers in that case.
    if (!nextIs(reDecimalFloat) && !nextIs(reHexFloat)) {
        return null;
    }

    // TODO: Parse more granularly

    const decimalFloat = consumeIfMatch(reDecimalFloat);
    if (decimalFloat) {
        return { type: "floating", value: decimalFloat };
    }

    const hexFloat = consumeIfMatch(reHexFloat);
    if (hexFloat) {
        return { type: "floating", value: hexFloat };
    }

    return null;
}

const reCharConstant = /^L?'([^'\\\n]|\\['"?\\abfnrtv]|\\[0-7]{1,3}|\\x[0-9a-fA-F]+|\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}))+'/;
const reStringLiteral = /^L?"([^"\\\n]|\\['"?\\abfnrtv]|\\[0-7]{1,3}|\\x[0-9a-fA-F]+|\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}))+"/;

function lexCharacterConstant() {
    const char = consumeIfMatch(reCharConstant);
    if (char) {
        return { type: "character", value: char };
    }

    return null;
}

function lexStringLiteral() {
    const str = consumeIfMatch(reStringLiteral);
    if (str) {
        return { type: "string", value: str };
    }
    
    return null;
}

input.addEventListener('input', () => {
    lex();
});
lex();
