import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RagDocumentsController } from './rag-documents.controller';

const flush = () => new Promise((r) => setImmediate(r));

const LONG = 'Preguntas frecuentes sobre planes de fibra óptica de Telecom Bolivianet. '.repeat(3);

function fileTxt(text = LONG) {
  return { mimetype: 'text/plain', buffer: Buffer.from(text), originalname: 'faq.txt', size: Buffer.byteLength(text) } as any;
}

function make() {
  const indexer = {
    index:           jest.fn().mockResolvedValue(3),
    removeDocument:  jest.fn().mockResolvedValue(undefined),
    invalidateCache: jest.fn().mockResolvedValue(undefined),
  };
  const docRepo = {
    create:  jest.fn((d) => d),
    save:    jest.fn((d) => Promise.resolve({ id: 'doc-1', createdAt: new Date(), updatedAt: new Date(), ...d })),
    find:    jest.fn(),
    findOne: jest.fn(),
    count:   jest.fn(),
    remove:  jest.fn().mockResolvedValue(undefined),
    update:  jest.fn().mockResolvedValue(undefined),
  };
  const chunkRepo = { count: jest.fn().mockResolvedValue(3) };
  const ctrl = new RagDocumentsController(indexer as any, docRepo as any, chunkRepo as any);
  return { ctrl, indexer, docRepo, chunkRepo };
}

describe('RagDocumentsController', () => {
  describe('uploadDocument', () => {
    it('sin archivo → 400', async () => {
      const { ctrl } = make();
      await expect(ctrl.uploadDocument(undefined as any, 'T', 'General')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sin título → 400', async () => {
      const { ctrl } = make();
      await expect(ctrl.uploadDocument(fileTxt(), '  ', 'General')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('texto insuficiente (<50 chars) → 400', async () => {
      const { ctrl } = make();
      await expect(ctrl.uploadDocument(fileTxt('corto'), 'T', 'General')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('happy → guarda el doc y responde status indexing', async () => {
      const { ctrl, docRepo, indexer } = make();
      const res = await ctrl.uploadDocument(fileTxt(), 'FAQ Planes', '');
      expect(docRepo.save).toHaveBeenCalled();
      expect(res.status).toBe('indexing');
      expect(res.category).toBe('General'); // default cuando viene vacío
      await flush();
      expect(indexer.index).toHaveBeenCalledWith('doc-1', expect.any(String));
      expect(docRepo.update).toHaveBeenCalledWith('doc-1', expect.objectContaining({ chunkCount: 3, indexingError: null }));
    });

    it('vectorización con 0 chunks → registra indexingError', async () => {
      const { ctrl, docRepo, indexer } = make();
      indexer.index.mockResolvedValueOnce(0);
      await ctrl.uploadDocument(fileTxt(), 'FAQ', 'General');
      await flush();
      expect(docRepo.update).toHaveBeenCalledWith('doc-1', expect.objectContaining({ indexingError: expect.stringContaining('0 chunks') }));
    });

    it('vectorización que lanza → captura el error en indexingError', async () => {
      const { ctrl, docRepo, indexer } = make();
      indexer.index.mockRejectedValueOnce(new Error('gemini down'));
      await ctrl.uploadDocument(fileTxt(), 'FAQ', 'General');
      await flush();
      expect(docRepo.update).toHaveBeenCalledWith('doc-1', { indexingError: 'gemini down' });
    });
  });

  describe('listDocuments', () => {
    it('devuelve total y documentos con chunkCount', async () => {
      const { ctrl, docRepo } = make();
      docRepo.find.mockResolvedValue([{ id: 'd1', title: 'A' }, { id: 'd2', title: 'B' }]);
      const res = await ctrl.listDocuments();
      expect(res.total).toBe(2);
      expect(res.documents[0]).toMatchObject({ id: 'd1', chunkCount: 3 });
    });
  });

  describe('getDocument', () => {
    it('encontrado → formatDoc + chunkCount', async () => {
      const { ctrl, docRepo } = make();
      docRepo.findOne.mockResolvedValue({ id: 'd1', title: 'A', isActive: true });
      const res = await ctrl.getDocument('d1');
      expect(res).toMatchObject({ id: 'd1', title: 'A', chunkCount: 3 });
    });

    it('no encontrado → 404', async () => {
      const { ctrl, docRepo } = make();
      docRepo.findOne.mockResolvedValue(null);
      await expect(ctrl.getDocument('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateDocument', () => {
    it('no encontrado → 404', async () => {
      const { ctrl, docRepo } = make();
      docRepo.findOne.mockResolvedValue(null);
      await expect(ctrl.updateDocument('x', undefined, 'T', 'C', 'true')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('solo metadatos (sin archivo) → actualiza y status updated', async () => {
      const { ctrl, docRepo, indexer } = make();
      docRepo.findOne.mockResolvedValue({ id: 'd1', title: 'viejo', isActive: true });
      const res = await ctrl.updateDocument('d1', undefined, 'nuevo', 'Cobertura', 'false');
      expect(res.status).toBe('updated');
      expect(res.title).toBe('nuevo');
      expect(res.isActive).toBe(false);
      expect(indexer.removeDocument).not.toHaveBeenCalled();
    });

    // FASE 2.2: la búsqueda vectorial respeta is_active, pero la caché
    // semántica no. Sin invalidarla, una respuesta generada desde un
    // documento recién desactivado se seguía sirviendo hasta 168 h.
    it('desactivar un documento invalida la caché semántica (sin borrar chunks)', async () => {
      const { ctrl, docRepo, indexer } = make();
      docRepo.findOne.mockResolvedValue({ id: 'd1', title: 'Precios 2025', isActive: true });

      await ctrl.updateDocument('d1', undefined, undefined, undefined, 'false');

      expect(indexer.invalidateCache).toHaveBeenCalledTimes(1);
      expect(indexer.removeDocument).not.toHaveBeenCalled(); // los chunks se conservan
    });

    it('reactivar un documento también invalida la caché', async () => {
      const { ctrl, docRepo, indexer } = make();
      docRepo.findOne.mockResolvedValue({ id: 'd1', title: 'Precios 2026', isActive: false });

      await ctrl.updateDocument('d1', undefined, undefined, undefined, 'true');

      expect(indexer.invalidateCache).toHaveBeenCalledTimes(1);
    });

    it('cambiar solo título/categoría NO invalida la caché', async () => {
      const { ctrl, docRepo, indexer } = make();
      docRepo.findOne.mockResolvedValue({ id: 'd1', title: 'viejo', isActive: true });

      await ctrl.updateDocument('d1', undefined, 'nuevo título', 'Cobertura', undefined);

      expect(indexer.invalidateCache).not.toHaveBeenCalled();
    });

    it('reenviar el mismo valor de isActive NO invalida la caché', async () => {
      const { ctrl, docRepo, indexer } = make();
      docRepo.findOne.mockResolvedValue({ id: 'd1', title: 'A', isActive: true });

      await ctrl.updateDocument('d1', undefined, undefined, undefined, 'true');

      expect(indexer.invalidateCache).not.toHaveBeenCalled();
    });

    it('con archivo válido → re-indexa (removeDocument + index) y status re-indexing', async () => {
      const { ctrl, docRepo, indexer } = make();
      docRepo.findOne.mockResolvedValue({ id: 'd1', title: 'A', isActive: true });
      const res = await ctrl.updateDocument('d1', fileTxt(), undefined, undefined, undefined);
      expect(indexer.removeDocument).toHaveBeenCalledWith('d1');
      expect(res.status).toBe('re-indexing');
      await flush();
      expect(indexer.index).toHaveBeenCalled();
    });
  });

  describe('deleteDocument', () => {
    it('no encontrado → 404', async () => {
      const { ctrl, docRepo } = make();
      docRepo.findOne.mockResolvedValue(null);
      await expect(ctrl.deleteDocument('x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('happy → remove del índice y del repo', async () => {
      const { ctrl, docRepo, indexer } = make();
      docRepo.findOne.mockResolvedValue({ id: 'd1', title: 'A' });
      const res = await ctrl.deleteDocument('d1');
      expect(indexer.removeDocument).toHaveBeenCalledWith('d1');
      expect(docRepo.remove).toHaveBeenCalled();
      expect(res).toEqual({ deleted: true, id: 'd1' });
    });
  });
});
