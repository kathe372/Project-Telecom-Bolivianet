import {
  Controller, Get, Post, Param, Query, Headers, Body,
  UnauthorizedException, BadRequestException, NotFoundException,
  Logger, ParseIntPipe, DefaultValuePipe, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../../database/entities/conversation.entity';
import { Message, MessageRole, MessageSource } from '../../database/entities/message.entity';
import { SessionService } from '../session/session.service';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service';
import { GetConversationsUseCase } from '../monitoring/use-cases/get-conversations.use-case';
import { BotMetricsService } from '../monitoring/bot-metrics.service';
import { ConversationSummaryJob } from '../monitoring/conversation-summary.job';
import { InternalTokenGuard } from '../../common/guards/internal-token.guard';
import { GeminiErrorMetricsService } from '../ai/gemini-error-metrics.service';
import { validatePhone } from '../../common/validators/phone.validator';


@UseGuards(InternalTokenGuard)
@Controller('monitor')
export class MonitorController {
  private readonly logger = new Logger(MonitorController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly session: SessionService,
    private readonly whatsapp: WhatsappApiService,
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
    private readonly getConversations: GetConversationsUseCase,
    private readonly botMetrics: BotMetricsService,
    private readonly summaryJob: ConversationSummaryJob,
    private readonly geminiErrorMetrics: GeminiErrorMetricsService,
  ) {}

  /** P4.1 (auditoría 2026-08): tasa de error/429 de Gemini en una ventana
   *  reciente — proxy de "salud de la cuota" ya que DSQ no expone un % de
   *  uso consultable. Pensado para un banner en el panel admin o para
   *  pollear desde afuera (ej. un futuro webhook de Slack). */
  @Get('gemini-health')
  async getGeminiHealth(
    @Query('windowMinutes', new DefaultValuePipe(5), ParseIntPipe) windowMinutes: number,
  ) {
    return this.geminiErrorMetrics.getStats(Math.min(Math.max(windowMinutes, 1), 15) * 60_000);
  }

  /** MEJORA-1D: dispara a demanda el resumen de conversaciones inactivas. */
  @Post('summarize-idle')
  async summarizeIdle() {
    return this.summaryJob.runOnce();
  }

  @Get('conversations')
  async listConversations(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('tab', new DefaultValuePipe('todas')) tab: string,
  ) {
    return this.getConversations.execute({ tab, page, limit });
  }

  @Get('conversations/escalated')
  async listEscalated() {

    const items = await this.convRepo.find({
      where: { isEscalated: true },
      order: { escalatedAt: 'DESC' },
    });

    const conversations = await this.enrichConversations(items);
    return { total: items.length, conversations };
  }

  private async enrichConversations(convs: Conversation[]) {
    if (convs.length === 0) return [];

    const ids = convs.map((c) => c.id);

    const lastMsgs = await this.msgRepo
      .createQueryBuilder('m')
      .where('m.conversationId IN (:...ids)', { ids })
      .andWhere((qb) => {
        const sub = qb.subQuery()
          .select('MAX(inner.createdAt)')
          .from(Message, 'inner')
          .where('inner.conversationId = m.conversationId')
          .getQuery();
        return `m.createdAt = ${sub}`;
      })
      .getMany();

    const countRows = await this.msgRepo
      .createQueryBuilder('m')
      .select('m.conversationId', 'cid')
      .addSelect('COUNT(m.id)', 'cnt')
      .where('m.conversationId IN (:...ids)', { ids })
      .groupBy('m.conversationId')
      .getRawMany<{ cid: string; cnt: string }>();

    const lastMsgMap = new Map(lastMsgs.map((m) => [m.conversationId, m.content]));
    const countMap   = new Map(countRows.map((r) => [r.cid, parseInt(r.cnt, 10)]));

    return convs.map((c) => ({
      ...this.formatConversation(c),
      ultimoMensaje: lastMsgMap.get(c.id) ?? null,
      totalMessages: countMap.get(c.id) ?? 0,
    }));
  }

  @Get('conversations/:phone')
  async getConversation(
    @Param('phone') rawPhone: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) msgLimit: number,
  ) {
    const phone = this.normalizePhone(rawPhone);

    const conv = await this.convRepo.findOne({ where: { phoneNumber: phone } });
    if (!conv) {
      return { found: false };
    }

    const messages = await this.msgRepo.find({
      where: { conversationId: conv.id },
      order: { createdAt: 'DESC' },
      take: msgLimit,
    });

    const liveSession = await this.session.getSession(phone).catch(() => null);

    return {
      found: true,
      conversation: this.formatConversation(conv),
      liveSession: liveSession
        ? {
            isEscalated: liveSession.isEscalated,
            pendingAction: liveSession.pendingAction,
            activeTicketId: liveSession.activeTicketId,
            activeInstallationId: liveSession.activeInstallationId,
            lastLocation: liveSession.lastLocation ?? null,
          }
        : null,
      messages: messages.reverse().map((m) => ({
        id: m.id,
        role: m.role,
        source: m.source,
        content: m.content,
        createdAt: m.createdAt,
        mediaUrl: m.mediaUrl  ?? null,
        mediaType: m.mediaType ?? null,
      })),
    };
  }

  @Get('stats')
  async getStats(
    @Query('window', new DefaultValuePipe(30), ParseIntPipe) windowDays: number,
  ) {

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalConversations,
      escalatedCount,
      todayMessages,
      todayConversations,
      metrics,
    ] = await Promise.all([
      this.convRepo.count(),
      this.convRepo.count({ where: { isEscalated: true } }),
      this.msgRepo
        .createQueryBuilder('m')
        .where('m.createdAt >= :start', { start: todayStart })
        .getCount(),
      this.convRepo
        .createQueryBuilder('c')
        .where('c.updatedAt >= :start', { start: todayStart })
        .getCount(),
      // MEJORA-1A: KPIs de negocio (escalación, deflexión, intenciones, latencia)
      this.botMetrics.getSummary(Math.min(Math.max(windowDays, 1), 365)),
    ]);

    return {
      total: {
        conversations: totalConversations,
        escalated: escalatedCount,
      },
      today: {
        conversations: todayConversations,
        messages: todayMessages,
      },
      metrics,
      generatedAt: new Date().toISOString(),
    };
  }

  @Post('conversations/:phone/takeover')
  async takeoverConversation(
    @Param('phone') rawPhone: string,
    @Body() body: { agentName?: string },
  ) {
    const phone = this.normalizePhone(rawPhone);

    const conv = await this.convRepo.findOne({ where: { phoneNumber: phone } });
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    conv.isEscalated = true;
    conv.escalatedAt = conv.escalatedAt ?? new Date();
    conv.agentName   = body.agentName ?? 'Agente';
    await this.convRepo.save(conv);
    await this.session.escalate(phone);

    this.logger.log(`Conversación ${phone} tomada por agente: ${conv.agentName}`);
    return { success: true, phoneNumber: phone, agentName: conv.agentName };
  }

  @Post('conversations/:phone/release')
  async releaseConversation(
    @Param('phone') rawPhone: string,
  ) {
    const phone = this.normalizePhone(rawPhone);

    const conv = await this.convRepo.findOne({ where: { phoneNumber: phone } });
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    conv.isEscalated = false;
    conv.escalatedAt = null;
    conv.agentName   = null;
    await this.convRepo.save(conv);
    await this.session.deescalate(phone);

    this.logger.log(`Conversación ${phone} devuelta al bot`);
    return { success: true, phoneNumber: phone };
  }

  @Post('conversations/:phone/send')
  async sendAdminMessage(
    @Param('phone') rawPhone: string,
    @Body() body: { text: string },
  ) {
    const phone = this.normalizePhone(rawPhone);

    if (!body.text?.trim()) throw new BadRequestException('Texto requerido');

    const conv = await this.convRepo.findOne({ where: { phoneNumber: phone } });
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    const metaMessageId = await this.whatsapp.sendText(phone, body.text.trim());

    const msg = this.msgRepo.create({
      conversationId: conv.id,
      role:           MessageRole.ADMIN,
      source:         MessageSource.ADMIN,
      content:        body.text.trim(),
      metaMessageId:  metaMessageId ?? null,
    });
    await this.msgRepo.save(msg);
    await this.session.addMessage(phone, 'admin', body.text.trim());

    this.logger.log(`Mensaje admin enviado a ${phone}: "${body.text.trim().substring(0, 50)}"`);
    return { success: true, messageId: msg.id };
  }

  /**
   * D1 (2026-08-07): normaliza el teléfono que llega por la URL al formato
   * canónico del sistema (local de 8 dígitos, el mismo con el que se indexan
   * `conversations` y las sesiones de Redis).
   *
   * Antes se usaba el parámetro CRUDO, así que quien llamara con "59171435981"
   * no encontraba la conversación de "71435981" — que es exactamente lo que
   * hacían BotProxyService y ChatbotDirectNotifier desde el backend. Aquellos
   * ya están corregidos, pero esta normalización es la que garantiza que el
   * chatbot funcione reciba el formato que reciba: sin ella, alcanza con que
   * alguien del otro lado vuelva a anteponer el prefijo para romperlo de nuevo,
   * y el síntoma (un 404, o peor, una conversación duplicada) es difícil de
   * atribuir a su causa.
   */
  private normalizePhone(raw: string): string {
    const resultado = validatePhone(raw);
    if (!resultado.valid) {
      throw new BadRequestException(`Teléfono inválido: ${resultado.error}`);
    }
    return resultado.normalized;
  }

  private formatConversation(c: Conversation) {
    return {
      id: c.id,
      phoneNumber: c.phoneNumber,
      clientId: c.clientId,
      clientName: c.clientName,
      isEscalated: c.isEscalated,
      agentName: c.agentName,
      escalatedAt: c.escalatedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
