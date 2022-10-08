import {WebMidiOutput} from '../common/midi/WebMidiOutput';
import {WebSocketMidiOutput} from '../common/midi/WebSocketMidiOutput';
import {Player} from '../common/player/Player';
import {MidiProcessor} from '../common/player/MidiProcessor';
import {defaultErrorReporter} from '../common/error/ErrorReporter';
import { MidiOutput } from '../common/midi/MidiOutput';

const PROGRAM_STORAGE_KEY = '_WEB_PLAYER_PROGRAM_987654321';
const OUTPUT_STORAGE_KEY = '_WEB_PLAYER_MIDI_OUTPUT_987654321';

let midiOutput: any = null;
let player: Player | null = null;
const codeProvider = {code: ''};
let wsOutput: MidiOutput;

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
  const updateButton = document.getElementById('updateButton') as HTMLButtonElement;
  const midiOutputSelect = document.getElementById('midiOutput') as HTMLSelectElement;
  const textArea = document.getElementById('editor') as any;
  const testMidiButton = document.getElementById('testMidiButton') as HTMLButtonElement;

  codeProvider.code = textArea.code;

  buildMidiOutputOptions(midiOutputSelect, midiAccess);
  initialiseWebSocketPort(midiOutputSelect);
  restoreFromLocaleStorage(textArea, midiOutputSelect, midiAccess);

  testMidiButton.onclick = () => {
    sendMiddleC(midiAccess, midiOutputSelect.value);
  };

  midiOutputSelect.onchange = () => {
    if (midiOutputSelect.value == "WebSocket") {
      midiOutput = wsOutput;
    } else {
      midiOutput = new WebMidiOutput(midiAccess.outputs.get(midiOutputSelect.value));
    }
  };

  function stopped(): void {
    startButton.innerText = 'Start';
    player = null;
  }

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
        processors: [
          new MidiProcessor(midiOutput ?? wsOutput, clockFn),
          {
            stopped: () => stopped(),
            ended: () => stopped(),
          }
        ],
        entryPoint: 'Root',
        errorReporter: defaultErrorReporter,
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
  let output: MidiOutput;

  if (portID === 'WebSocket' && wsOutput != null) {
    output = wsOutput;
  } else {
    output = midiAccess.outputs.get(portID);
  }

  if (output) {
    output.noteOn(60, 100, 1);

    setTimeout(() => {
      output.noteOff(60, 0, 1);
    }, 500);
  }
}

function initialiseWebSocketPort(midiOutputSelect: HTMLSelectElement) {
  const connection = new WebSocket('ws://localhost:9000');

  connection.onopen = function () {
    const wsOption = midiOutputSelect.appendChild(document.createElement('option'));
    wsOption.innerText = 'WebSocket';
    wsOption.value = 'WebSocket';

    wsOutput = new WebSocketMidiOutput(connection);
  };

  // Log errors
  connection.onerror = (error) => console.error(error);

  connection.onmessage = async (e) => {
    // Nothing to do here...
    const text = await e.data.text();
    console.log(text);
    console.log('message received.', JSON.parse(text));
  };
}