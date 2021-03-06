# extended-tracker

`extended-tracker` (temporary name) is a declarative language and a suite of tools for interactive music and live coding.

Drawing its inspiration from music trackers, it allows describing MIDI note sequences in a human-readable syntax.

```
Root = [
    # start

    $ player speed: 100 / 60
    $ head stepDuration: 1/2
    
    p: 69, v: 80
    p: 64, v: 60
    p: 76, v: 60
    ,
    ,
    -

    @ start
]
```

An overview of the language can be found [here](language.md).

## Install

With NodeJS installed, follow these steps:

```
git clone https://github.com/pckerneis/extended-tracker
cd extended-tracker
npm install
```

## Run in a terminal

You can start a player in the terminal with:

```
npm run start
```

You'll have to specify a program file to read from, the program's entry point (the name of the declaration that should be read first) and a MIDI ouput.

There are a few command-line options in order skip the prompts:

```
npm run start -f programs/lullaby.txt -e Root -o 0
```

## Run in a browser

In order to generate a JavaScript bundle, run the command:

```
npm run build-web
```

The bundle is located in `dist/web/bundle.js`. 

There a demo page located in `static/web-demo.html`. Note that Firefox does not support WebMidi.

## Repository content

- `src/common/` Platform-agnostic code for most of the utility classes (scanner, parser, player...)
- `src/node/` NodeJS-specific code
- `src/web/` Browser-specific code
- `static/` A web demo showcasing usage in a browser
- `programs/` A bunch of test programs used for debugging

## Project architecture overview

- The `Scanner` and the `Parser` are responsible for building an [AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree) representation of a program.
- The `Player` is a time keeper and a scheduler. It is responsible for creating the main reader `Head`.
- A reader `Head` moves from a sequence step to another, evaluating AST portions on the fly and spawning child heads.
- Platform-specific `MidiOutput` objects are responsible for sending the MIDI messages.

## Getting involved

I'd greatly appreciate feedback and help.

Pulls requests are welcome!
