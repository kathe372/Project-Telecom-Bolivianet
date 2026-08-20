import { useEffect, useRef, useState, useCallback } from 'react';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { useAuthStore } from '@/store/authStore';


export interface BotEvent {
  EventType:   string;
  PhoneNumber: string;
  ClientName?: string;
  TicketId?:   string;
  Priority?:   string;
  Reason?:     string;
  Timestamp:   string;
  ReceivedAt:  string;
}

export type HubStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseAdminHubOptions {
  enabled?: boolean;
  onBotEvent?: (event: BotEvent) => void;
}

interface UseAdminHubReturn {
  status:       HubStatus;
  lastEvent:    BotEvent | null;
  errorMessage: string | null;
  disconnect:   () => Promise<void>;
}

const HUB_URL = `${import.meta.env.VITE_API_URL ?? ''}/hubs/admin`;

export function useAdminHub({
  enabled = true,
  onBotEvent,
}: UseAdminHubOptions = {}): UseAdminHubReturn {
  const token        = useAuthStore((s) => s.token);
  const connRef      = useRef<HubConnection | null>(null);
  const [status, setStatus]           = useState<HubStatus>('disconnected');
  const [lastEvent, setLastEvent]     = useState<BotEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const onBotEventRef = useRef(onBotEvent);
  onBotEventRef.current = onBotEvent;

  const disconnect = useCallback(async () => {
    if (connRef.current) {
      await connRef.current.stop();
      connRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !token) return;

    let stopped = false;

    const conn = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => token,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) => {
          const delays = [0, 2000, 10000, 30000];
          return delays[ctx.previousRetryCount] ?? 60000;
        },
      })
      .configureLogging(
        import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning,
      )
      .build();

    conn.onreconnecting(() => {
      if (!stopped) setStatus('connecting');
    });

    conn.onreconnected(() => {
      if (!stopped) setStatus('connected');
    });

    conn.onclose(() => {
      if (!stopped) setStatus('disconnected');
    });

    conn.on('BotEvent', (event: BotEvent) => {
      if (stopped) return;
      setLastEvent(event);
      onBotEventRef.current?.(event);
    });

    conn.on('Pong', (_timestamp: number) => {
    });

    connRef.current = conn;

    setStatus('connecting');
    conn
      .start()
      .then(() => {
        if (!stopped) setStatus('connected');
      })
      .catch((err: unknown) => {
        if (!stopped) {
          setErrorMessage(err instanceof Error ? err.message : 'Error al conectar con el hub');
          setStatus('error');
        }
      });

    return () => {
      stopped = true;
      conn.off('BotEvent');
      conn.off('Pong');
      conn.stop().catch(() => {});
      connRef.current = null;
      setStatus('disconnected');
    };
  }, [enabled, token]);

  return { status, lastEvent, errorMessage, disconnect };
}
