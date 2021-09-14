import {MessageProcessor} from '../../common/player/Player';
import {formatTime} from '../../common/utils/time';

export class PrintProcessor implements MessageProcessor {
  ended(): void {
    console.log('Ended');
  }

  process(time: number, headId: string, messages: any[]): void {
    console.log(formatTime(time), headId, messages);
  }
}
