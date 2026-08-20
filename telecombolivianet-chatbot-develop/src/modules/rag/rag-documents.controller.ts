import {
  Controller, Get, Post, Delete, Patch, Param,
  UploadedFile, UseInterceptors, Body,
  BadRequestException, NotFoundException,
  Logger, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { InternalTokenGuard } from '../../common/guards/internal-token.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { memoryStorage } from 'multer';
import * as pdfParse from 'pdf-parse';
import { KnowledgeDocument, KnowledgeChunk } from '../../database/entities/knowledge.entity';
import { DocumentIndexer } from './document-indexer.service';


@UseGuards(InternalTokenGuard)
@Controller('rag/documents')
export class RagDocumentsController {
  private readonly logger = new Logger(RagDocumentsController.name);

  constructor(
    private readonly indexer: DocumentIndexer,
    @InjectRepository(KnowledgeDocument)
    private readonly docRepo: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeChunk)
    private readonly chunkRepo: Repository<KnowledgeChunk>,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'text/plain'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Solo se aceptan archivos PDF o TXT'), false);
        }
      },
    }),
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
    @Body('category') category: string,
  ) {

    if (!file) throw new BadRequestException('Se requiere un archivo');
    if (!title?.trim()) throw new BadRequestException('Se requiere un título');

    this.logger.log(`Subiendo documento: "${title}" (${file.mimetype}, ${file.size} bytes)`);

    const text = await this.extractText(file);
    if (!text || text.trim().length < 50) {
      throw new BadRequestException('El documento no contiene texto suficiente para indexar');
    }

    const doc = this.docRepo.create({
      title: title.trim(),
      category: category?.trim() || 'General',
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      isActive: true,
      charCount: text.length,
    });
    const savedDoc = await this.docRepo.save(doc);

    this.vectorizeInBackground(savedDoc.id, text);

    return {
      id: savedDoc.id,
      title: savedDoc.title,
      category: savedDoc.category,
      status: 'indexing',
      message: 'Documento recibido. La vectorización se realiza en segundo plano.',
    };
  }

  @Get()
  async listDocuments() {

    const docs = await this.docRepo.find({ order: { createdAt: 'DESC' } });

    const withChunks = await Promise.all(
      docs.map(async (doc) => {
        const chunkCount = await this.chunkRepo.count({
          where: { documentId: doc.id },
        });
        return { ...this.formatDoc(doc), chunkCount };
      }),
    );

    return { total: docs.length, documents: withChunks };
  }

  @Get(':id')
  async getDocument(
    @Param('id', ParseUUIDPipe) id: string,
  ) {

    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const chunkCount = await this.chunkRepo.count({ where: { documentId: id } });

    return { ...this.formatDoc(doc), chunkCount };
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'text/plain'];
        cb(allowed.includes(file.mimetype) ? null : new BadRequestException('Solo PDF o TXT'), allowed.includes(file.mimetype));
      },
    }),
  )
  async updateDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('title') title: string | undefined,
    @Body('category') category: string | undefined,
    @Body('isActive') isActive: string | undefined,
  ) {

    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    // FASE 2.2: se recuerda el valor previo para saber si hay que invalidar la
    // caché semántica (ver DocumentIndexer.invalidateCache).
    const activoAntes = doc.isActive;

    if (title?.trim()) doc.title = title.trim();
    if (category?.trim()) doc.category = category.trim();
    if (isActive !== undefined) doc.isActive = isActive === 'true';

    const cambioActivacion = doc.isActive !== activoAntes;

    if (file) {
      const text = await this.extractText(file);
      if (text && text.trim().length >= 50) {
        doc.originalFilename = file.originalname;
        doc.mimeType = file.mimetype;
        doc.fileSize = file.size;
        doc.charCount = text.length;
        doc.indexedAt = null;

        await this.docRepo.save(doc);

        await this.indexer.removeDocument(id);
        this.vectorizeInBackground(id, text);

        return { ...this.formatDoc(doc), status: 're-indexing' };
      }
    }

    await this.docRepo.save(doc);

    // FASE 2.2: activar o desactivar cambia qué puede responder el bot, pero
    // las respuestas ya cacheadas no lo saben. Se invalidan (la caché se
    // repuebla sola con la primera consulta de cada tema).
    if (cambioActivacion) {
      await this.indexer.invalidateCache();
      this.logger.log(
        `Documento "${doc.title}" ${doc.isActive ? 'activado' : 'desactivado'} — caché semántica invalidada`,
      );
    }

    return { ...this.formatDoc(doc), status: 'updated' };
  }

  @Delete(':id')
  async deleteDocument(
    @Param('id', ParseUUIDPipe) id: string,
  ) {

    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    await this.indexer.removeDocument(id);
    await this.docRepo.remove(doc);

    this.logger.log(`Documento "${doc.title}" (${id}) eliminado con sus chunks`);
    return { deleted: true, id };
  }

  private vectorizeInBackground(docId: string, text: string): void {
    this.indexer
      .index(docId, text)
      .then((count) => {
        if (count === 0) {
          this.logger.error(
            `Documento ${docId}: 0 chunks indexados — verificar API de Gemini y logs del servicio`,
          );
          this.docRepo.update(docId, {
            indexingError: 'Indexación falló: 0 chunks generados. Revise la configuración de la API de Gemini.',
          });
        } else {
          this.docRepo.update(docId, {
            indexedAt: new Date(),
            chunkCount: count,
            indexingError: null,
          });
          this.logger.log(`Documento ${docId}: ${count} chunks indexados ✔`);
        }
      })
      .catch((err) => {
        this.logger.error(`Error vectorizando ${docId}: ${err.message}`);
        this.docRepo.update(docId, { indexingError: err.message });
      });
  }

  private async extractText(file: Express.Multer.File): Promise<string> {
    if (file.mimetype === 'application/pdf') {
      const parsed = await pdfParse(file.buffer);
      return parsed.text;
    }
    return file.buffer.toString('utf-8');
  }

  private formatDoc(doc: KnowledgeDocument) {
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      charCount: doc.charCount,
      isActive: doc.isActive,
      indexedAt: doc.indexedAt,
      indexingError: doc.indexingError,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
