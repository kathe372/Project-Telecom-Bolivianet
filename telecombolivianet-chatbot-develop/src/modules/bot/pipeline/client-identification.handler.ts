import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionService } from '../../session/session.service';
import {
  IClientRepository, CLIENT_REPOSITORY,
  ITicketRepository, TICKET_REPOSITORY,
} from '../../client/sistema-api.interfaces';
import { Conversation } from '../../../database/entities/conversation.entity';
import { MessageContext } from './message-context';
import { MessageHandler } from './message-handler';
import { SESSION_CONSTANTS } from '../constants/session.constants';

@Injectable()
export class ClientIdentificationHandler implements MessageHandler {
  private readonly logger = new Logger(ClientIdentificationHandler.name);

  constructor(
    private readonly session: SessionService,
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    private readonly config: ConfigService,
  ) {}

  async handle(ctx: MessageContext, next: () => Promise<void>): Promise<void> {
    ctx.updatedSession = await this.identifyClient(ctx.phone, ctx.session!);

    if (ctx.type === 'location' && ctx.locationLat != null && ctx.locationLng != null) {
      const locationPatch = {
        lastLocation: {
          lat:     ctx.locationLat,
          lng:     ctx.locationLng,
          name:    ctx.locationName,
          address: ctx.locationAddress,
        },
        locationCapturedAt: Date.now(),
        locationSource:     'whatsapp_gps' as const,
      };
      await this.session.updateSession(ctx.phone, locationPatch);
      ctx.updatedSession = { ...ctx.updatedSession!, ...locationPatch };
    }

    await next();
  }

  private async identifyClient(phone: string, session: any): Promise<any> {
    // 2026-08-05: ya hay una elección de cuenta pendiente (2+ clientes con
    // este teléfono) — no re-consultar; bot-orchestrator resuelve la
    // ambigüedad cuando llegue la respuesta al botón "¿con cuál continuamos?".
    if (session.ambiguousClients && session.ambiguousClients.length > 0) {
      return session;
    }

    const isKnown = session.clientId ||
      (session.clientId === null && session.clientName === SESSION_CONSTANTS.PROSPECT_SENTINEL);

    // 2026-08-05: la identidad cacheada solo se confía mientras sea reciente
    // — si un admin cambia el teléfono de un cliente en el panel, una sesión
    // ya identificada no debe seguir con el dato viejo indefinidamente (antes
    // duraba hasta que la sesión de Redis expirara sola, hasta 24h).
    const reverifyMs =
      (this.config.get<number>('bot.identityReverifyMinutes') ?? 120) * 60_000;
    const isFresh = !!session.identityVerifiedAt &&
      (Date.now() - session.identityVerifiedAt) < reverifyMs;

    if (isKnown && isFresh) {
      if (session.clientId && session.clientName && session.clientName !== SESSION_CONSTANTS.PROSPECT_SENTINEL) {
        try {
          await this.convRepo.upsert(
            { phoneNumber: phone, clientId: session.clientId, clientName: session.clientName },
            ['phoneNumber'],
          );
        } catch (err: any) {
          this.logger.warn(`Sync clientName para ${phone}: ${err?.message}`);
        }
      }
      return session;
    }

    try {
      // 2026-08-05: PhoneMain no es único — puede haber más de un cliente
      // con este teléfono (ej. dos familiares, dos contratos). getClientByPhone
      // (single) elegía uno arbitrariamente y escondía el resto; getClientsByPhone
      // trae todas las coincidencias para poder detectar la ambigüedad.
      const clients = await this.clientRepo.getClientsByPhone(phone);

      if (clients.length > 1) {
        await this.session.updateSession(phone, {
          clientId:           null,
          clientName:         null,
          ambiguousClients:   clients.map(c => ({
            clientId:     c.Id,
            clientName:   c.FullName,
            clientStatus: c.Status,
            planId:       c.PlanId,
            planName:     c.PlanName,
            planSpeedMbps: c.PlanSpeedMbps ?? null,
            totalDebt:    c.TotalDebt,
            tbnCode:      c.TbnCode,
          })),
          identityVerifiedAt: Date.now(),
        });
        this.logger.warn(
          `Teléfono ${phone} tiene ${clients.length} cuentas asociadas — se le pedirá elegir una.`,
        );
        return this.session.getSession(phone);
      }

      if (clients.length === 1) {
        const client = clients[0];
        await this.session.setClientData(phone, {
          clientId:           client.Id,
          clientName:         client.FullName,
          clientStatus:       client.Status,
          planId:             client.PlanId,
          planName:           client.PlanName,
          // El backend ya lo devolvía y se descartaba. Hace falta para calcular
          // el umbral de la prueba de velocidad en el procedimiento de soporte.
          planSpeedMbps:      client.PlanSpeedMbps ?? null,
          totalDebt:          client.TotalDebt,
          tbnCode:            client.TbnCode,
          identityVerifiedAt: Date.now(),
        });
        await this.session.updateSession(phone, { ambiguousClients: null });
        await this.convRepo.upsert(
          { phoneNumber: phone, clientId: client.Id, clientName: client.FullName },
          ['phoneNumber'],
        );

        const freshSession = await this.session.getSession(phone);
        if (!freshSession.activeTicketId) {
          try {
            const activeTickets = await this.ticketRepo.getClientActiveTickets(client.Id);
            const openTicket = activeTickets.find(t =>
              ['Abierto', 'EnProceso', 'EnVisita', 'PendienteCliente'].includes(t.Status),
            );
            if (openTicket) {
              await this.session.patchSession(phone, { activeTicketId: openTicket.Id });
              this.logger.log(`activeTicketId restaurado para ${phone}: ${openTicket.Id}`);
            }
          } catch (err) {
            this.logger.warn(`No se pudo restaurar activeTicketId para ${phone}: ${(err as Error).message}`);
          }
        }

        return this.session.getSession(phone);
      }

      // clients.length === 0
      await this.session.updateSession(phone, {
        clientName:         SESSION_CONSTANTS.PROSPECT_SENTINEL,
        ambiguousClients:   null,
        identityVerifiedAt: Date.now(),
      });
    } catch (err) {
      this.logger.error(`Error identificando cliente ${phone}: ${(err as Error).message}`);
    }

    return this.session.getSession(phone);
  }
}
