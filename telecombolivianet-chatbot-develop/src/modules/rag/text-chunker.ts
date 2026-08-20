import { Injectable } from '@nestjs/common';

/**
 * Parte un texto en chunks para vectorizar. Algoritmo PURO (sin dependencias),
 * testeable en aislamiento. Prefiere cortar por bloques de pregunta (formato
 * FAQ con "¿"); si el texto no es FAQ, cae a ventana de palabras con solape.
 */
@Injectable()
export class TextChunker {
  private static readonly MIN_CHUNK_CHARS = 20;
  private static readonly MIN_QA_BLOCKS   = 3;

  /**
   * @throws si overlap >= size — BUG-R1: con `start += size - overlap`, un
   *   solape >= tamaño deja el índice sin avanzar → bucle infinito que cuelga
   *   el proceso. Se falla rápido y explícito en vez de colgarse.
   */
  split(text: string, size = 100, overlap = 20): string[] {
    if (size <= 0) throw new Error(`TextChunker: size (${size}) debe ser > 0`);
    if (overlap >= size) throw new Error(`TextChunker: overlap (${overlap}) debe ser < size (${size})`);
    return this.byQuestions(text, size) ?? this.byWords(text, size, overlap);
  }

  private byQuestions(text: string, size: number): string[] | null {
    const blocks = text.split(/(?=¿)/).map((b) => b.trim())
      .filter((b) => b.length > TextChunker.MIN_CHUNK_CHARS);
    if (blocks.length < TextChunker.MIN_QA_BLOCKS) return null;

    const chunks: string[] = [];
    let current = '';
    let words = 0;
    for (const block of blocks) {
      const blockWords = block.split(/\s+/).length;
      if (words + blockWords > size && current) {
        chunks.push(current.trim());
        current = block;
        words = blockWords;
      } else {
        current = current ? `${current}\n\n${block}` : block;
        words += blockWords;
      }
    }
    if (current.trim().length > TextChunker.MIN_CHUNK_CHARS) chunks.push(current.trim());
    return chunks;
  }

  private byWords(text: string, size: number, overlap: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    for (let start = 0; start < words.length; start += size - overlap) {
      chunks.push(words.slice(start, start + size).join(' '));
    }
    return chunks.filter((c) => c.trim().length > TextChunker.MIN_CHUNK_CHARS);
  }
}
