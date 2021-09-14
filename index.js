const chalk = require('chalk');
const pjson = require('./package.json');
const commander = require('commander');
const inquirer = require('inquirer');
const fs = require('fs');
const midi = require('midi');
const chokidar = require('chokidar');
const runProgram = require('./dist/node/node/runner').runProgram;

console.log(chalk.green.bold(`Starting ${pjson.name}-${pjson.version}`));

const output = new midi.Output();

if (!output.getPortCount()) {
  const error = (txt) => chalk.red(txt);
  console.log(error('No MIDI output device found !'));
  return 0;
}

let foundFile;
let foundOutput;
let foundEntry;
const codeProvider = {};
main();

async function main() {
  commander
    .version(pjson.version)
    .option('-f, --file [file]', 'File to read from')
    .option('-o, --output [output]', 'Midi output port to use')
    .option('-e, --entry [entry]', 'The program\'s entry point')
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

      foundEntry = options.entry;

      while (foundEntry == null) {
        await inquirer.prompt([{type: 'input', name: 'entry', message: 'Which entry point'}])
          .then(answers => {
            if (answers.entry.trim().length > 0) {
              foundEntry = answers.entry.trim();
            }
          });
      }

      chokidar
        .watch(foundFile)
        .on('change', () => {
          codeProvider.code = fs.readFileSync(foundFile, 'utf8');
        });

      codeProvider.code = fs.readFileSync(foundFile, 'utf8');

      const runnerOptions = {
        codeProvider,
        entryPoint: foundEntry,
        midiOutput: output,
        onProgramEnded: () => onProgramEnded(runnerOptions),
        reportError,
      };

      runProgram(runnerOptions);
    });

  commander.parse(process.argv);
}

function printAvailableMidiOutputDevices() {
  console.log('Available MIDI output devices :');
  for (let i = 0; i < output.getPortCount(); ++i) {
    console.log(`${i} : ${output.getPortName(i)}`);
  }
}

async function onProgramEnded(runnerOptions) {
  console.log('');

  await inquirer.prompt([{type: 'confirm', name: 'confirm', message: 'Restart ?'}])
    .then(answers => {
      if (answers.confirm) {
        runProgram(runnerOptions);
      } else {
        process.exit(0);
      }
    });
}

function reportError(...args) {
  console.log(chalk.red(args));
}
