/**
 * Formatea un embedding al literal que espera pgvector (`[1,2,3]`).
 * Centraliza lo que antes se duplicaba en searchChunks, indexDocument y la
 * caché semántica (DRY): un solo lugar conoce el formato del vector.
 */
export const toSqlVector = (embedding: number[]): string => `[${embedding.join(',')}]`;
