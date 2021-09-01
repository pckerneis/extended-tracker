const chalk = require('chalk');
const pjson = require('./package.json');
const commander = require('commander');
const inquirer = require('inquirer');
const fs = require('fs');
const midi = require('midi');
const chokidar = require('chokidar');
const Player = require('./dist/player/MidiPlayer').MidiPlayer;
const MidiOutput = require('./dist/midi/MidiOutput').MidiOutput;

console.log(chalk.green.bold(`Starting ${pjson.name}-${pjson.version}`));

const output = new midi.Output();

if (!output.getPortCount()) {
  const error = (txt) => chalk.red(txt);
  console.log(error('No MIDI output device found !'));
  return 0;
}

let wroteOnce = false;

function onStepPlayed(stepInfo) {
  const pathMaxLength = 24;
  const path = [...stepInfo.sequenceStack, stepInfo.sequenceName].join('/');
  const truncated = path.length > pathMaxLength ? path.slice(path.length - pathMaxLength) : path;
  const fixedSize = truncated.padEnd(pathMaxLength, ' ');
  const stepNumber = stepInfo.stepNumber;
  const messageBar = new Array(stepInfo.noteOnCount).fill('#').join('');
  const t = stepInfo.timePosition + 1;
  const context = `[${t}] ${fixedSize} [${stepNumber}]`;
  const string = `${context} ${messageBar} `.padEnd(80);

  if (! wroteOnce) {
    wroteOnce = true;
  } else {
    process.stdout.clearLine(0);
  }

  process.stdout.cursorTo(0);
  process.stdout.write(string);
}

const errorReporter = {
  reportError: (...args) => {
    if (args.length > 0) {
      console.log('');
      console.error(...args);
    }
  }
}

let foundFile;
let foundOutput;
const codeSource = {};
main();

async function main() {
  commander
    .version(pjson.version)
    .option('-f, --file [file]', 'File to read from')
    .option('-o, --output [output]', 'Midi output port to use')
    .action(async options => {
      const parsed = parseInt(options.output);
      foundOutput = (isNaN(parsed) || parsed < 0 || parsed > output.getPortCount()) ? null : parsed;

      if (foundOutput == null) {
        printAvailableMidiOutputDevices();
      }

      while (foundOutput == null) {
        await inquirer.prompt([{type: 'input', name: 'output', message: 'MIDI output'}])
          .then(answers => {
            const parsed = parseInt(answers.output);
            foundOutput = (isNaN(parsed) || parsed < 0 || parsed > output.getPortCount()) ? null : parsed;
          });
      }

      output.openPort(foundOutput);

      foundFile = fs.existsSync(options.file) ? options.file : null;

      while (foundFile == null) {
        await inquirer.prompt([{type: 'input', name: 'file', message: 'Which file'}])
          .then(answers => {
            if (fs.existsSync(answers.file)) {
              foundFile = answers.file
            }
          });
      }

      chokidar
        .watch(foundFile)
        .on('change', () => {
          codeSource.code = fs.readFileSync(foundFile, 'utf8');
        });

      runProgram();
    });

  commander.parse(process.argv);
}

function runProgram() {
  codeSource.code = fs.readFileSync(foundFile, 'utf8');
  Player.play(codeSource, new MidiOutput(output), onProgramEnded, onStepPlayed, errorReporter);
}

function printAvailableMidiOutputDevices() {
  console.log('Available MIDI output devices :');
  for (let i = 0; i < output.getPortCount(); ++i) {
    console.log(`${i} : ${output.getPortName(i)}`);
  }
}

async function onProgramEnded() {
  console.log('');

  await inquirer.prompt([{type: 'confirm', name: 'confirm', message: 'Restart ?'}])
    .then(answers => {
      if (answers.confirm) {
        runProgram();
      } else {
        process.exit(0);
      }
    });
}
