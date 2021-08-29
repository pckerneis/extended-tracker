# Musical language design notes

## Comments

```
# This is a comment
```

## Messages

A variable can store a message which is a list of params between curly brackets.

Most common params are p (pitch) and v (velocity) both ranging from 0 to 127.

```
k = {p:36, v:80} # kick
s = {p:38, v:80} # snare
```

## Numbers

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

## Booleans

```
a = true
b = false
c = a && b
d = a || b || c
e = a == d
```

## Constants

Readonly values.

T : current time position

## Ternary condition

```
a = T % 4 == 0 ? 123 : 456;
```

## Sequence

A sequence is a list of steps between brackets.

```
k = {p:36, v:80} # kick
s = {p:38, v:80} # snare

seq = [
k
-
k|s
-
k
-
k|s
-
]
```

### Silent step

A step is "silent" if it begins with "-".

### Inline sequences

Inline sequence steps with ";" separator.

```
k = {p:36, v:80} # kick
s = {p:38, v:80} # snare

seq = [ k ; - ; k|s ; - ; k ; - ; k|s ; - ]
```

### Nested sequences

Sequences can be nested inside another. They are played one at the time.

```
k = {p:36, v:80} # kick
s = {p:38, v:80} # snare

seqA = [
k
-
k|s
-
]

seqB = [ 
{seqA}
p: 12|p: 14
{seqA} 
]
```

### Conditional branching

```
seqA = [
k
-
]

Program = [
{seqA}
myCondition ? { seqA } : {
    k|s
    -
}
]
```

Chaining

```
Program = [
{seqA}
myCondition ? { seqA } : 
mycondition2 ? { seqB } : {seqC }
```

## Channels

The "|" operator allows separating channels on a given step.

```
main = [ p: 10 | p: 40 ]
```

## "Program" variable

When playing a file, the player looks for a sequence stored in the "Program" variable.

```
Program = [
p: 36, v: 127       | p: 30, v: 80
-                   | ,
p: 41               | -
-                   | p: 30
p: 36               | ,
-                   | -
]
```

## "i" (instrument) param

By default, the instruments used follow the channel index, but we can use "i" param to change the mapping

```
Program = [
p: 43, i: 1
]
```

## Spaces and new lines

Space/tab characters are non significant.

Empty lines (no non-whitespace character once comments are stripped) are ignored. To make a sequence empty, put "-" or ",".

```
Program = [
p: 12

p: 40 # comment in end of step

, # this line is not empty
# but this one is, once the comment is stripped
]
```


## Flags and Jumps

One can define flags which are temporal markers and jump to a flag defined within the same sequence.

Flags are lines in a sequence that begin with "$" character.

Jumps are achieved with the "->" command.

```
loop = [
$ begin
p: 0
p: 2
p: 4
-> begin
]
```

### Conditional jump

```
finished = false

loop = [
$ begin
p: 0
p: 2
p: 4
finished ? {} : {-> begin}
]
```

# Program syntax

```
Program => Declaration*
Declaration => VARIABLE_NAME "=" (Evaluable | Message | Sequence) NEW_LINE
Evaluable => Primitive | Expression | VARIABLE_NAME
Primitive => BOOL | NUMBER
Expression => ...

Sequence => "[" StepList "]"
StepList => Step ((";" | NEW_LINE) Step)+
Step => ChanelList | ConditionalBranch | Flag | Jump
ChanelList => ParamList ("|" ParamList)*
ConditionalBranch => Evaluable "?" Branch ":" (ConditionalBranch | Branch)
Branch => "{" (StepList | VARIABLE_NAME) "}"
Flag => "$" FLAG_NAME
Jump => "->" FLAG_NAME

Message = "{" ParamList "}"

ParamList => (Param ("," Param)+)
Param => PARAM_NAME ":" (Primitive | Expression | VARIABLE_NAME)

```
