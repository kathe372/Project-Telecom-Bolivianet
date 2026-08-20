import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { INotificationRepository, NOTIFICATION_REPOSITORY } from '../client/sistema-api.interfaces';


export enum AdminEventType {
  TICKET_ALTA             = 'TICKET_ALTA',
  TICKET_CREATED          = 'TICKET_CREATED',
  TICKET_CLOSED           = 'TICKET_CLOSED',
  TICKET_RESCHEDULED      = 'TICKET_RESCHEDULED',
  CONVERSATION_ESCALATED  = 'CONVERSATION_ESCALATED',
}

export interface AdminNotificationPayload {
  EventType:   AdminEventType;
  PhoneNumber: string;
  ClientName?: string;
  TicketId?:   string;
  Priority?:   string;
  Reason?:     string;
  Timestamp:   string;
}

@Injectable()
export class AdminSignalrNotifierService implements OnModuleInit {
  private readonly logger = new Logger(AdminSignalrNotifierService.name);
  private readonly notifyUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepo: INotificationRepository,
  ) {
    const apiUrl = this.config.get<string>('sistema.apiUrl');
    this.notifyUrl = `${apiUrl}/api/bot-events`;
  }

  onModuleInit() {
    this.logger.log(`AdminSignalrNotifier listo → ${this.notifyUrl}`);
  }

  async notifyHighPriorityTicket(params: {
    phoneNumber: string;
    clientName: string;
    ticketId: string;
    description?: string;
  }): Promise<void> {
    await this.send({
      EventType:   AdminEventType.TICKET_ALTA,
      PhoneNumber: params.phoneNumber,
      ClientName:  params.clientName,
      TicketId:    params.ticketId,
      Priority:    'Alta',
      Reason:      params.description,
      Timestamp:   new Date().toISOString(),
    });
  }

  async notifyTicketCreated(params: {
    phoneNumber: string;
    clientName: string;
    ticketId: string;
    priority: string;
  }): Promise<void> {
    await this.send({
      EventType:   AdminEventType.TICKET_CREATED,
      PhoneNumber: params.phoneNumber,
      ClientName:  params.clientName,
      TicketId:    params.ticketId,
      Priority:    params.priority,
      Timestamp:   new Date().toISOString(),
    });
  }

  async notifyTicketClosed(params: {
    phoneNumber: string;
    clientName: string;
    ticketId: string;
  }): Promise<void> {
    await this.send({
      EventType:   AdminEventType.TICKET_CLOSED,
      PhoneNumber: params.phoneNumber,
      ClientName:  params.clientName,
      TicketId:    params.ticketId,
      Timestamp:   new Date().toISOString(),
    });
  }

  async notifyTicketRescheduled(params: {
    phoneNumber: string;
    clientName: string;
    ticketId: string;
    fecha: string;
    hora: string;
  }): Promise<void> {
    await this.send({
      EventType:   AdminEventType.TICKET_RESCHEDULED,
      PhoneNumber: params.phoneNumber,
      ClientName:  params.clientName,
      TicketId:    params.ticketId,
      Reason:      `Reagendado para ${params.fecha} a las ${params.hora}`,
      Timestamp:   new Date().toISOString(),
    });
  }

  async notifyEscalation(params: {
    phoneNumber: string;
    clientName?: string;
    reason?: string;
  }): Promise<void> {
    await this.send({
      EventType:   AdminEventType.CONVERSATION_ESCALATED,
      PhoneNumber: params.phoneNumber,
      ClientName:  params.clientName,
      Reason:      params.reason ?? 'Solicitado por el cliente o fallo en RAG',
      Timestamp:   new Date().toISOString(),
    });
  }

  private async send(payload: AdminNotificationPayload): Promise<void> {
    try {
      const token = this.notificationRepo.getCurrentToken();
      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {};

      // 2026-08-07: acá el catchError devolvía null y a continuación se logueaba
      // "Admin notificado" igual, hubiera llegado o no. Con 22 escalaciones
      // históricas y sólo 3 respuestas humanas en toda la vida del sistema, no
      // había forma de saber si el aviso fallaba o si simplemente nadie miraba
      // el panel. Un fallo y un éxito se veían idénticos en los logs.
      const resultado = await firstValueFrom(
        this.http
          .post(this.notifyUrl, payload, { headers })
          .pipe(
            timeout(3000),
            catchError((err) => {
              this.logger.error(JSON.stringify({
                event:   'admin_notify_failed',
                tipo:    payload.EventType,
                phone:   payload.PhoneNumber,
                error:   err.message,
                detalle: 'El agente NO fue avisado. Si era una escalación, nadie sabe que existe.',
              }));
              return of(null);
            }),
          ),
      );

      if (resultado === null) return;

      this.logger.log(
        `Admin notificado → ${payload.EventType} [${payload.PhoneNumber}]`,
      );
    } catch (err) {
      this.logger.error(`Error inesperado en AdminSignalrNotifier: ${err.message}`);
    }
  }
}
