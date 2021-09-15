# Musical language design notes

## Structure of a program

A program is a list of declarations.

```
Tempo = (...)
SequenceA = (...)
SequenceB = (...)
Root = (...)
```

A declaration is an identifier, optional arguments and a value expression.

```
SequenceA     (velocity)         = [ p: 13, v: velocity; p: 18; p: 14; - ]
^ Identifier  ^ Argument list      ^ Value
          
```

## Comments

```
// This is a comment
```

## Primitive data types

### Numbers

Variables can store integer and floating-point numbers. All numbers are represented as single precision floats internally.

```
pitch = 12
someValue = 1.23
```

Support for basic arithmetic operations.

```
a = 1 / 2
b = a * 3
c = a + b - 12
```

### Booleans

```
a = true
b = false
c = a && b
d = a || b || c
e = a == d
```

## Ternary expression

```
t > 10 ? 123 : 321
```

## Sequence

A sequence is a list of steps between brackets (`[]`). Sequence steps are read one at the time by a player head.

```
seq = [
    p:36, v:80
    -
    p:38, v:80
    -
    p:36, v:80
    p:36, v:80
    p:38, v:80
    -
]
```

### Inline sequences

Inline sequence steps with the `;` separator.

```
seq = [ p:36, v:80 ; - ; p:38, v:80 ; - ; p:36, v:80 ; p:36, v:80 ; p:38, v:80 ; - ]
```

### Nested sequences

Sequences can be nested inside another with the curly brackets (`{}`).

When the player head reaches the end of a nested sequence, it returns to the parent sequence, reading the next available step.

```
seqA = [
    p:36, v:80
    -
    p:38, v:80
    -
]

seqB = [ 
    {seqA}
    p: 12 | p: 14
    -
    {seqA} 
]
```

### Parametrized sequences

One can declare a sequence with an enumeration of parameters. These are specified between parenthesis after the sequence name.

```
SeqA (pitch, velocity) = [ p: pitch, v: velocity ]
```

To call a parametrized sequence :

```
Main = [
    { SeqA(velocity: 50, pitch: 80) }
]
```

## Voices

The "|" operator allows separating voices on a given sequence step.

```
Sequence = [
    p: 10 | p: 40
]
```

Voices allow for multiple notes to be played at the same time.

## Messages

A message is a list of coma-separated key-value pairs. A key and a value is delimited by a colon.

```
p: 60, v: 117
```

The value can be omitted, in which case the implicit value is the current value, if any, that have the same key in the current environment. If the key is unknown, the value is undefined.

```
Sequence(v) = [ p: 60, v ]
```

## Sequence operators

### `||` any

The `any` (`||`) logical operator allows to play two sequences simultaneously.

```
Root = [...] || [...]
```

When a player head reaches a `any` operator, it creates two child heads. The parent head waits until *any* of the child heads terminates before continuing.

### `&&` all

The `all` (`&&`) logical operator allows to play two sequences simultaneously.

```
Root = [...] && [...]
```

When a player head reaches a `all` operator, it creates two child heads. The parent head waits until *all* of the child heads terminate before continuing.

## Conditional branching

The ternary condition operators are useful to create branching inside sequences.

```
PathA = [
    // ...
]

PathB = [
    // ...
]

Sequence = [
    { myCondition ? PathA : PathB }
]
```

Chaining

```
Main = [
    myCondition ? { PathA } : 
    mycondition2 ? { PathB } : {PathC }
```

## Flags and Jumps

One can define flags which are temporal markers and jump to a flag defined within the same sequence.

Flags are lines in a sequence that begin with "#" character followed by a name.

Jumps begin with the "@" operator followed by a flag name.

```
loop = [
    # begin
    p: 0
    p: 2
    p: 4
    @ begin
]
```

> ### Outer jumps
> 
> It's possible to jump from a sequence to another by specifying a sequence name followed by '#'. You can then
> specify a flag to jump to within the target sequence. 
> 
> ```
> Sequence1 = [
>     p:1
>     # flag A
>     p:2
> ]
> 
> Main = [
>     @ Sequence1 # flag A
> ]
> ```
>
> ### Conditional jump
> 
> ```
> finished = false
> 
> loop = [
>     # begin
>     p: 0
>     p: 2
>     p: 4
>     finished ? {} : { [@ begin] }
> ]
> ```

## Control messages

Control messages are special instructions that can appear either at the top level
or in a sequence. They allow sending messages to parts of the execution engine such
as the player to control speed or other parameters.

Control messages don't increment the time counter : the next step will play immediately after.

```
$ player speed: 120 / 60
$ head stepDuration: 1 / 4
```

## Spaces and new lines

Space and tab characters are not significant.

A step line with only whitespace characters (with comments stripped out) is ignored. To make a line count as an empty step, put "|" or ",".

```
Main = [
    p: 12
    
    p: 40 // comment in end of step
    
    , // this line is not empty
    // but this one is, once the comment is stripped
]
```
