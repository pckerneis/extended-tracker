import {WebMidiOutput} from '../common/midi/WebMidiOutput';
import {Player} from '../common/player/Player';
import {MidiProcessor} from '../common/player/MidiProcessor';

const PROGRAM_STORAGE_KEY = '_WEB_PLAYER_PROGRAM_987654321';
const OUTPUT_STORAGE_KEY = '_WEB_PLAYER_MIDI_OUTPUT_987654321';

let midiOutput: any = null;
let player: Player;
const codeProvider = {code: ''};

function buildMidiOutputOptions(midiOutputSelect: any, midiAccess: any): void {
  const noneOption = midiOutputSelect.appendChild(document.createElement('option'));
  noneOption.innerText = 'None';

  midiAccess.outputs.forEach((output: any) => {
    const option = midiOutputSelect.appendChild(document.createElement('option'));
    option.innerText = output.name;
    option.value = output.id;
  });
}

function restoreFromLocaleStorage(textArea: any, midiOutputSelect: any, midiAccess: any): void {
  const storedProgram = localStorage.getItem(PROGRAM_STORAGE_KEY);

  if (storedProgram) {
    textArea.value = storedProgram;
    codeProvider.code = textArea.value;
  }

  const storedOutput = localStorage.getItem(OUTPUT_STORAGE_KEY);

  if (storedOutput) {
    midiOutputSelect.value = storedOutput;
    midiOutput = new WebMidiOutput(midiAccess.outputs.get(midiOutputSelect.value));
  }
}

function updateCode(textArea: any, updateButton: any): void {
  localStorage.setItem(PROGRAM_STORAGE_KEY, textArea.value);
  codeProvider.code = textArea.value;
  updateButton.disabled = true;
}

(navigator as any).requestMIDIAccess().then((midiAccess: any) => {
  const startButton = document.getElementById('startButton') as any;
  const updateButton = document.getElementById('updateButton') as any;
  const midiOutputSelect = document.getElementById('midiOutput') as any;
  const textArea = document.getElementById('editor') as any;
  const testMidiButton = document.getElementById('testMidiButton');

  codeProvider.code = textArea.code;

  buildMidiOutputOptions(midiOutputSelect, midiAccess);
  restoreFromLocaleStorage(textArea, midiOutputSelect, midiAccess);

  testMidiButton.onclick = () => {
    sendMiddleC(midiAccess, midiOutputSelect.value);
  };

  midiOutputSelect.onchange = () => {
    midiOutput = new WebMidiOutput(midiAccess.outputs.get(midiOutputSelect.value));
  };

  function togglePlayState(): void {
    if (player != null) {
      startButton.innerText = 'Start';
      player.stop();
      player = null;
    } else {
      startButton.innerText = 'Stop';
      const clockFn = () => performance.now() / 1000;
      player = Player.create({
        codeProvider,
        clockFn,
        processors: [new MidiProcessor(midiOutput, clockFn)],
        entryPoint: 'Root'
      });

      player.start('Root');
    }
  }

  startButton.onclick = () => togglePlayState();

  textArea.oninput = () => updateButton.disabled = false;

  updateButton.onclick = () => updateCode(textArea, updateButton);

  midiOutputSelect.oninput = debounce(() => {
    localStorage.setItem(OUTPUT_STORAGE_KEY, midiOutputSelect.value);
  });

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.code === 'KeyS') {
      updateCode(textArea, updateButton);
      event.preventDefault();
    }

    if (event.ctrlKey && event.code === 'Space') {
      togglePlayState();
      event.preventDefault();
    }
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
