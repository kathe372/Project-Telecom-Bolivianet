import { Injectable } from '@nestjs/common';
import { SessionData } from '../session/session.service';
import { BotConfigCacheService } from './bot-config-cache.service';
import { MessageSenderService } from './pipeline/message-sender.service';

/**
 * PASO 6B (2026-08): única fuente de la lista de opciones del menú principal.
 * Antes esta lógica vivía como método privado de BotOrchestratorService y
 * solo era alcanzable en el primer contacto — inalcanzable para una `tool`
 * del LLM, así que después del primer mensaje el bot solo podía describir
 * las opciones en texto plano, sin botones.
 */
@Injectable()
export class MainMenuService {
  constructor(
    private readonly botConfigCache: BotConfigCacheService,
    private readonly sender: MessageSenderService,
  ) {}

  /** Saludo de bienvenida (primer contacto, o un "hola" suelto más adelante) + menú. */
  async sendWelcome(session: SessionData): Promise<void> {
    const isProspect = !session.clientId;
    const cfg      = await this.botConfigCache.getConfig();
    const nombre    = isProspect ? '' : (session.clientName ?? '');
    const template  = isProspect
      ? (cfg.Mensajes.BienvenidaProspecto || cfg.Mensajes.Bienvenida)
      : cfg.Mensajes.Bienvenida;
    const greeting  = template.replace(/\{+nombre\}+/gi, nombre).trim();

    await this.sendList(session, cfg, greeting);
  }

  /** Menú disparado por el LLM (`show_main_menu`) cuando la intención del cliente no está clara. */
  async sendMenu(session: SessionData, intro: string): Promise<void> {
    const cfg = await this.botConfigCache.getConfig();
    await this.sendList(session, cfg, intro);
  }

  private async sendList(session: SessionData, cfg: any, body: string): Promise<void> {
    const isProspect    = !session.clientId;
    const activeOptions = cfg.Menu.Opciones.filter((o: any) =>
      o.Activa && (isProspect ? !o.SoloCliente : true),
    );

    // Meta rechaza toda la lista con 400 "Duplicated row id" si dos filas
    // comparten id. El id nace del Intent (editable desde el panel), así que
    // se deduplica con sufijo '#<Id>'; al recibir la respuesta se recorta.
    const seenIds = new Set<string>();
    const rows = activeOptions.map((o: any) => {
      let id = o.Intent.toLowerCase();
      if (seenIds.has(id)) id = `${id}#${o.Numero}`;
      seenIds.add(id);
      return { id, title: o.Etiqueta, description: o.Descripcion ?? '' };
    });

    if (rows.length === 0) return;

    // Antes llamaba a whatsapp.sendList() directo — funcionaba, pero se
    // saltaba por completo la persistencia (msgRepo + memoria de sesión de
    // Redis que alimenta el historial que ve el LLM) y el reintento/outbox
    // que sí tiene el resto del bot desde el PASO 8. sendWithList() ya hace
    // las dos cosas, con la misma degradación a texto plano si falla.
    await this.sender.sendWithList(
      session, body,
      { buttonLabel: cfg.Menu.TituloBoton, sections: [{ title: cfg.Menu.TituloSeccion, rows }] },
    );
  }
}
