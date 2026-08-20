import { MessageContext } from './message-context';

export interface MessageHandler {
  handle(ctx: MessageContext, next: () => Promise<void>): Promise<void>;
}

export const MESSAGE_PIPELINE = Symbol('MESSAGE_PIPELINE');
