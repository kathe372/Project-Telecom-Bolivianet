import { SessionData } from '../../session/session.service';

export const PROMPT_SECTIONS = Symbol('PROMPT_SECTIONS');

export interface IPromptSection {
  applies(session: SessionData): boolean;
  render(session: SessionData): string;
}
