import {WebMidiOutput} from '../common/midi/WebMidiOutput';
import {Player} from '../common/player/Player';
import {MidiProcessor} from '../common/player/MidiProcessor';

const PROGRAM_STORAGE_KEY = '_WEB_PLAYER_PROGRAM_987654321'
const OUTPUT_STORAGE_KEY = '_WEB_PLAYER_MIDI_OUTPUT_987654321'

let midiOutput: any = null;

(navigator as any).requestMIDIAccess().then((midiAccess: any) => {
  const midiOutputSelect = document.getElementById('midiOutput');
  const option = midiOutputSelect.appendChild(document.createElement('option'));
  option.innerText = 'None';

  midiAccess.outputs.forEach((output: any) => {
    const option = midiOutputSelect.appendChild(document.createElement('option'));
    option.innerText = output.name;
    option.value = output.id;
  });

  const textArea = document.getElementById('editor');

  const storedProgram = localStorage.getItem(PROGRAM_STORAGE_KEY);

  if (storedProgram) {
    textArea['value'] = storedProgram;
  }

  const storedOutput = localStorage.getItem(OUTPUT_STORAGE_KEY);

  if (storedOutput) {
    midiOutputSelect['value'] = storedOutput;
    midiOutput = new WebMidiOutput(midiAccess.outputs.get(midiOutputSelect['value']));
    console.debug(midiOutput);
  }

  document.getElementById('testMidiButton').onclick = () => {
    sendMiddleC(midiAccess, midiOutputSelect['value']);
  };

  midiOutputSelect.onchange = () => {
    midiOutput = new WebMidiOutput(midiAccess.outputs.get(midiOutputSelect['value']));
    console.debug(midiOutput);
  };

  const startButton = document.getElementById('startButton');
  let player: Player;

  startButton.onclick = () => {
    if (player != null) {
      startButton.innerText = 'Start';
      player.stop();
      player = null;
    } else {
      startButton.innerText = 'Stop';
      player = Player.create({
        codeProvider: {code: textArea['value']},
        clockFn: () => performance.now() / 1000,
        processors: [new MidiProcessor(midiOutput)],
        entryPoint: 'Root'
      });

      player.start('Root');
    }
  };

  textArea.oninput = debounce(() => {
    localStorage.setItem(PROGRAM_STORAGE_KEY, textArea['value']);
  });

  midiOutputSelect.oninput = debounce(() => {
    localStorage.setItem(OUTPUT_STORAGE_KEY, midiOutputSelect['value']);
  });
});

function debounce(func: Function, timeout = 300){
  let timer: any;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

function sendMiddleC(midiAccess: any, portID: string) {
  const output = midiAccess.outputs.get(portID);

  if (output) {
    output.send([0x90, 60, 100]);

    setTimeout(() => {
      output.send([176, 120, 0]);
    }, 500);
  }
}
