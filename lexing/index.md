Lexical analysis is the first stage of compilation. At this stage the source code is split into _tokens_, which represent each atomic part of the program. These atomic parts are things such as symbols, numbers, names of things, and the like.

The change from source code to tokens is in principle small. Both source code and tokens are sequences of some sort of symbols, but moving from text characters to symbols specific to the language is very helpful, as it simplifies the work the compiler must do later.

You can use this << Whatever we call it >> to see how a lexer may split source code into tokens.

<<< Interactable element here >>>
