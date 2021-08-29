const chalk = require('chalk');
const pjson = require('./package.json');
const commander = require('commander');
const inquirer = require('inquirer');
const fs = require('fs');
const midi = require('midi');
const chokidar = require('chokidar');
const Player = require('./dist/player/Player').Player;
const MidiOutput = require('./dist/midi/MidiOutput').MidiOutput;

console.log(chalk.green.bold(`Starting ${pjson.name}-${pjson.version}`));

const output = new midi.Output();
const outputPortCount = output.getPortCount();

if (!outputPortCount) {
  const error = (txt) => chalk.red(txt);
  console.log(error('No MIDI output device found !'));
  return 0;
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
      foundOutput = (isNaN(parsed) || parsed < 0 || parsed > outputPortCount) ? null : parsed;

      if (foundOutput == null) {
        printAvailableMidiOutputDevices();
      }

      while (foundOutput == null) {
        await inquirer.prompt([{type: 'input', name: 'output', message: 'MIDI output'}])
          .then(answers => {
            const parsed = parseInt(answers.output);
            foundOutput = (isNaN(parsed) || parsed < 0 || parsed > outputPortCount) ? null : parsed;
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
  Player.play(codeSource, new MidiOutput(output), onProgramEnded);
}

function printAvailableMidiOutputDevices() {
  console.log('Available MIDI output devices :');
  for (let i = 0; i < outputPortCount; ++i) {
    console.log(`${i} : ${output.getPortName(i)}`);
  }
}

async function onProgramEnded() {
  await inquirer.prompt([{type: 'confirm', name: 'confirm', message: 'Restart ?'}])
    .then(answers => {
      if (answers.confirm) {
        runProgram();
      } else {
        process.exit(0);
      }
    });
}
