import { Injectable } from '@nestjs/common';

export interface QuickReply {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

/**
 * MEJORA-1C: normaliza quick-replies a los límites de la WhatsApp Cloud API:
 * máximo 3 botones por mensaje, títulos ≤20 caracteres, body ≤1024 caracteres,
 * ids únicos. Devuelve null si no queda ningún botón válido (el llamador
 * degrada a texto plano).
 */
@Injectable()
export class InteractiveReplyBuilder {

  private static readonly MAX_BUTTONS = 3;
  private static readonly MAX_TITLE_CHARS = 20;
  private static readonly MAX_BODY_CHARS = 1024;
  private static readonly MAX_LIST_ROWS = 10;
  private static readonly MAX_ROW_TITLE_CHARS = 24;
  private static readonly MAX_ROW_DESC_CHARS = 72;
  private static readonly MAX_BUTTON_LABEL_CHARS = 20;
  private static readonly MAX_SECTION_TITLE_CHARS = 24;

  /**
   * PASO 8: mismo patrón que build(), para `interactive.type: list` (hasta
   * 10 filas, en vez de 3 botones) — usado por tools que muestran un
   * catálogo dinámico (planes de instalación, horarios), no un menú fijo.
   */
  buildList(
    body: string,
    sections: ListSection[],
    buttonLabel: string,
  ): { body: string; buttonLabel: string; sections: ListSection[] } | null {
    const seen = new Set<string>();
    let budget = InteractiveReplyBuilder.MAX_LIST_ROWS;
    const cleanedSections: ListSection[] = [];

    for (const s of sections ?? []) {
      if (budget <= 0) break;

      const rows = (s?.rows ?? [])
        .filter((r) => r?.id?.trim() && r?.title?.trim())
        .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
        .slice(0, budget)
        .map((r) => ({
          id:    r.id.trim(),
          title: this.truncate(r.title.trim(), InteractiveReplyBuilder.MAX_ROW_TITLE_CHARS),
          ...(r.description?.trim()
            ? { description: this.truncate(r.description.trim(), InteractiveReplyBuilder.MAX_ROW_DESC_CHARS) }
            : {}),
        }));

      if (rows.length === 0) continue;

      budget -= rows.length;
      cleanedSections.push({
        title: this.truncate((s.title ?? '').trim() || 'Opciones', InteractiveReplyBuilder.MAX_SECTION_TITLE_CHARS),
        rows,
      });
    }

    if (cleanedSections.length === 0) return null;

    return {
      body:        this.truncate(body?.trim() || '¿Cómo deseas continuar?', InteractiveReplyBuilder.MAX_BODY_CHARS),
      buttonLabel: this.truncate(buttonLabel?.trim() || 'Ver opciones', InteractiveReplyBuilder.MAX_BUTTON_LABEL_CHARS),
      sections:    cleanedSections,
    };
  }

  build(
    body: string,
    replies: QuickReply[],
  ): { body: string; buttons: QuickReply[] } | null {
    const seen = new Set<string>();
    const buttons = (replies ?? [])
      .filter((r) => r?.id?.trim() && r?.title?.trim())
      .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .slice(0, InteractiveReplyBuilder.MAX_BUTTONS)
      .map((r) => ({
        id:    r.id.trim(),
        title: this.truncate(r.title.trim(), InteractiveReplyBuilder.MAX_TITLE_CHARS),
      }));

    if (buttons.length === 0) return null;

    return {
      body: this.truncate(body?.trim() || '¿Cómo deseas continuar?', InteractiveReplyBuilder.MAX_BODY_CHARS),
      buttons,
    };
  }

  private truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  }
}
