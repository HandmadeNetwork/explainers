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
            consume(keyword);
            continue;
        }

        const identifier = lexIdentifier();
        if (identifier) {
            console.log("identifier", identifier);
            consume(identifier);
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
    if (nextIs(r)) {
        const m = rest().match(r);
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
            return keyword;
        }
    }
    return null;
}

function lexIdentifier() {
    // TODO: universal-character-name, I guess, bleh
    return consumeIfMatch(/^[a-zA-Z_][a-zA-Z0-9_]*/);
}

input.addEventListener('input', () => {
    lex();
});
lex();
