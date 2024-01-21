// See Annex A.1 of the C spec:
// https://www.open-std.org/jtc1/sc22/WG14/www/docs/n1256.pdf

const editor = document.querySelector("#editor");
const highlights = document.querySelector("#highlights");
const results = document.querySelector("#results");

let source;
let cur;
let line, col;
let eof;

const colors = {
    "keyword": "bg-light-red",
    "identifier": "bg-light-blue",
    "integer": "bg-light-purple",
    "floating": "bg-light-green",
    "punctuator": "bg-light-silver",
}

function lex() {
    source = editor.innerText;
    cur = 0;
    line = 1;
    col = 1;
    eof = false;

    if (source.length === 0) {
        eof = true;
    }

    const tokens = [];    
    let err = null;
    while (!eof) {
        consumeWhitespaceAndComments();
        if (eof) {
            break;
        }

        const punctuator = lexPunctuator();
        if (punctuator) {
            tokens.push(punctuator);
            continue;
        }

        const char = lexCharacterConstant();
        if (char) {
            tokens.push(char);
            continue;
        }

        const str = lexStringLiteral();
        if (str) {
            tokens.push(str);
            continue;
        }

        const identifier = lexIdentifierOrKeyword();
        if (identifier) {
            tokens.push(identifier);
            continue;
        }

        const floating = lexFloatingConstant();
        if (floating) {
            tokens.push(floating);
            continue;
        }

        const integer = lexIntegerConstant();
        if (integer) {
            tokens.push(integer);
            continue;
        }

        err = "failed to lex, bad token"; // TODO: better error
        break;
    }

    // Highlight tokens
    {
        // Track all newlines so we can emit them in our highlights
        const newlineCurs = [];
        for (let i = 0; i < source.length; i++) {
            if (source[i] === "\n") {
                newlineCurs.push(i);
            }
        }

        let highlightHTML = "";
        let lastCur = 0;
        for (const token of tokens) {
            // Emit spaces and newlines until we get to the start of the token
            while (true) {
                let nextNewlineCur = null;
                for (const newlineCur of newlineCurs) {
                    if (lastCur <= newlineCur && newlineCur < token.loc.cur) {
                        nextNewlineCur = newlineCur;
                        break;
                    }
                }
                const numSpaces = Math.min(token.loc.cur, nextNewlineCur ?? token.loc.cur) - lastCur;
                highlightHTML += " ".repeat(numSpaces);
                
                if (nextNewlineCur === null) {
                    break;
                }
                highlightHTML += "\n";
                lastCur = nextNewlineCur + 1;
            }

            highlightHTML += `<span class="${ colors[token.type] }">${ " ".repeat(token.loc.length) }</span>`;

            lastCur = token.loc.cur + token.loc.length;
        }
        highlights.innerHTML = highlightHTML;
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

    if (cur >= source.length) {
        eof = true;
    }
}

function advanceBy(n) {
    const curBefore = cur;
    for (let i = 0; i < n && !eof; i++) {
        bumpCur();
    }
    return { cur: curBefore, length: n };
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
        return consume(m[0]);
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

const keywords = [
    "auto", "break", "case", "char", "const", "continue", "default", "double",
    "do", "else", "enum", "extern", "float", "for", "goto", "if", "inline",
    "int", "long", "register", "restrict", "return", "short", "signed",
    "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned",
    "void", "volatile", "while", "_Bool", "_Complex", "_Imaginary",
];

function lexIdentifierOrKeyword() {
    // TODO: universal-character-name, I guess, bleh
    const ident = consumeIfMatch(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (ident) {
        for (const keyword of keywords) {
            const str = source.substring(ident.cur, ident.cur + ident.length);
            if (str === keyword) {
                return { type: "keyword", loc: ident };
            }
        }
        return { type: "identifier", loc: ident };
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
        return { type: "integer", subtype: "decimal", loc: decimal };
    }

    const hex = consumeIfMatch(/^0[xX][0-9a-fA-F]*/);
    if (hex) {
        return { type: "integer", subtype: "hex", loc: hex };
    }

    const octal = consumeIfMatch(/^0[0-7]*/);
    if (octal) {
        return { type: "integer", subtype: "octal", loc: octal };
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
        integer.loc.length += longlong.length;
        integer.longth = 2;
        return;
    }
    
    const long = consumeIfMatch(/^[lL]/);
    if (long) {
        integer.loc.length += long.length;
        integer.longth = 1;
        return;
    }
}

function lexIntegerUnsigned(integer) {
    const unsigned = consumeIfMatch(/^[uU]/);
    if (unsigned) {
        integer.loc.length += unsigned.length;
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
        return { type: "floating", loc: decimalFloat };
    }

    const hexFloat = consumeIfMatch(reHexFloat);
    if (hexFloat) {
        return { type: "floating", loc: hexFloat };
    }

    return null;
}

const reCharConstant = /^L?'([^'\\\n]|\\['"?\\abfnrtv]|\\[0-7]{1,3}|\\x[0-9a-fA-F]+|\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}))+'/;
const reStringLiteral = /^L?"([^"\\\n]|\\['"?\\abfnrtv]|\\[0-7]{1,3}|\\x[0-9a-fA-F]+|\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}))+"/;

function lexCharacterConstant() {
    const char = consumeIfMatch(reCharConstant);
    if (char) {
        return { type: "character", loc: char };
    }

    return null;
}

function lexStringLiteral() {
    const str = consumeIfMatch(reStringLiteral);
    if (str) {
        return { type: "string", loc: str };
    }
    
    return null;
}

// Punctuators must be sorted by length in order to ensure that e.g. "++" is
// not parsed as "+" "+".
const punctuators = [
    "%:%:",
    
    "<<=", ">>=", "...",
    
    "<:", ":>", "<%", "%>", "%:", "<<", ">>", "<=", ">=", "##", "->", "++",
    "--", "*=", "/=", "%=", "+=", "-=", "&=", "^=", "|=", "&&", "||", "==",
    "!=",
    
    "<", ">", ".", "&", "*", "+", "-", "~", "!", "/", "%", "^", "|", "?", ":",
    ";", "=", ",", "#", "[", "]", "(", ")", "{", "}",
];

function lexPunctuator() {
    for (const punctuator of punctuators) {
        if (nextIs(punctuator)) {
            const loc = consume(punctuator);
            return { type: "punctuator", loc: loc };
        }
    }
    return null;    
}

editor.addEventListener('input', () => {
    lex();
});
lex();
