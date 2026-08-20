import {
  Controller, Post, Get, Body, Logger, HttpCode, Optional,
} from '@nestjs/common';
import { BotOrchestratorService } from '../bot/bot-orchestrator.service';
import { WhatsappMockService } from './whatsapp-mock.service';


@Controller('simulate')
export class SimulatorController {
  private readonly logger = new Logger('Simulator');

  private history: Array<{
    direction: 'in' | 'out';
    from: string;
    type: string;
    content: string;
    timestamp: string;
  }> = [];

  constructor(
    private readonly orchestrator: BotOrchestratorService,
    @Optional() private readonly mockWa: WhatsappMockService,
  ) {}

  @Post('message')
  @HttpCode(200)
  async sendMessage(
    @Body() body: { from: string; text: string },
  ) {
    const { from, text } = body;
    if (!from || !text) {
      return { error: 'Se requieren "from" (número) y "text"' };
    }

    this.log('in', from, 'text', text);
    this.logger.log(`\n💬 Usuario [${from}]: ${text}`);

    const before = this.mockWa?.sentMessages.length ?? 0;

    await this.orchestrator.handleIncoming({
      from,
      messageId: `sim_${Date.now()}`,
      type: 'text',
      text,
    });

    const botReplies = this.mockWa
      ? this.mockWa.sentMessages.slice(before).map((m) => m.content)
      : [];

    return { ok: true, from, text, botReplies };
  }

  @Post('location')
  @HttpCode(200)
  async sendLocation(
    @Body() body: { from: string; lat: number; lng: number; name?: string },
  ) {
    const { from, lat, lng, name } = body;
    if (!from || lat === undefined || lng === undefined) {
      return { error: 'Se requieren "from", "lat" y "lng"' };
    }

    this.log('in', from, 'location', `lat:${lat},lng:${lng}`);
    this.logger.log(`\n📍 Usuario [${from}]: [ubicación] lat=${lat} lng=${lng}${name ? ` (${name})` : ''}`);

    const before = this.mockWa?.sentMessages.length ?? 0;

    await this.orchestrator.handleIncoming({
      from,
      messageId: `sim_loc_${Date.now()}`,
      type: 'location',
      locationLat: lat,
      locationLng: lng,
      locationName: name,
    });

    const botReplies = this.mockWa
      ? this.mockWa.sentMessages.slice(before).map((m) => m.content)
      : [];

    return { ok: true, from, lat, lng, botReplies };
  }

  @Post('image')
  @HttpCode(200)
  async sendImage(
    @Body() body: { from: string; caption?: string },
  ) {
    const { from, caption } = body;
    if (!from) return { error: 'Se requiere "from"' };

    this.log('in', from, 'image', caption || '[sin caption]');
    this.logger.log(`\n🖼️  Usuario [${from}]: [imagen]${caption ? ` "${caption}"` : ''}`);

    await this.orchestrator.handleIncoming({
      from,
      messageId: `sim_img_${Date.now()}`,
      type: 'image',
      imageId: 'mock_image_id',
      imageCaption: caption,
    });

    return { ok: true, from, type: 'image' };
  }

  @Post('button')
  @HttpCode(200)
  async pressButton(
    @Body() body: { from: string; buttonId: string; buttonTitle?: string },
  ) {
    const { from, buttonId, buttonTitle } = body;
    if (!from || !buttonId) {
      return { error: 'Se requieren "from" y "buttonId"' };
    }

    this.log('in', from, 'button', buttonId);
    this.logger.log(`\n🔘 Usuario [${from}]: [botón] ${buttonTitle || buttonId}`);

    await this.orchestrator.handleIncoming({
      from,
      messageId: `sim_btn_${Date.now()}`,
      type: 'interactive',
      text: buttonTitle || buttonId,
      interactiveId: buttonId,
    });

    return { ok: true, from, buttonId };
  }

  @Get('history')
  getHistory() {
    return {
      total: this.history.length,
      messages: this.history,
    };
  }

  @Post('clear')
  @HttpCode(200)
  clearHistory() {
    this.history = [];
    return { ok: true, cleared: true };
  }

  private log(
    direction: 'in' | 'out',
    from: string,
    type: string,
    content: string,
  ) {
    this.history.push({
      direction,
      from,
      type,
      content,
      timestamp: new Date().toISOString(),
    });
  }
}
