import { Injectable, Inject } from '@nestjs/common';
import { IIntentMapper, INTENT_MAP_CONFIG } from './intent-mapper.interface';

@Injectable()
export class InteractiveIntentMapperService implements IIntentMapper {
  private readonly map: ReadonlyMap<string, string>;

  constructor(
    @Inject(INTENT_MAP_CONFIG) config: Record<string, string>,
  ) {
    this.map = new Map(Object.entries(config));
  }

  resolve(interactiveId: string): string | undefined {
    return this.map.get(interactiveId);
  }
}
