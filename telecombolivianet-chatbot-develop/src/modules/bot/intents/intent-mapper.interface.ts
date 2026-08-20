export interface IIntentMapper {
  resolve(interactiveId: string): string | undefined;
}

export const INTENT_MAPPER        = Symbol('INTENT_MAPPER');
export const INTENT_MAP_CONFIG    = Symbol('INTENT_MAP_CONFIG');
