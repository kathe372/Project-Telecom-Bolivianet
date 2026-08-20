import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany, ManyToOne, JoinColumn,
} from 'typeorm';


@Entity('knowledge_documents')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 300 })
  title: string;

  @Column({ length: 100, default: 'General' })
  category: string;

  @Column({ name: 'original_filename', length: 300, nullable: true })
  originalFilename: string | null;

  @Column({ name: 'mime_type', length: 100, nullable: true })
  mimeType: string | null;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number | null;

  @Column({ name: 'char_count', type: 'int', nullable: true })
  charCount: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'chunk_count', type: 'int', default: 0 })
  chunkCount: number;

  @Column({ name: 'indexed_at', type: 'timestamptz', nullable: true })
  indexedAt: Date | null;

  @Column({ name: 'indexing_error', type: 'text', nullable: true })
  indexingError: string | null;

  @Column({ name: 'uploaded_by', length: 200, nullable: true })
  uploadedBy: string | null;

  @OneToMany(() => KnowledgeChunk, (c) => c.document, { cascade: true })
  chunks: KnowledgeChunk[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}


@Entity('knowledge_chunks')
export class KnowledgeChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne(() => KnowledgeDocument, (d) => d.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: KnowledgeDocument;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'chunk_index' })
  chunkIndex: number;


  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
