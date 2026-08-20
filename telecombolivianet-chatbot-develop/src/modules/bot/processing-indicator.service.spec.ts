import { ProcessingIndicatorService } from './processing-indicator.service';

describe('ProcessingIndicatorService (MEJORA-1B)', () => {
  const whatsapp = {
    markAsRead: jest.fn().mockResolvedValue(undefined),
    sendText:   jest.fn().mockResolvedValue('id'),
  };
  const config = { get: jest.fn().mockReturnValue(100) }; // umbral 100ms para test
  let service: ProcessingIndicatorService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    whatsapp.markAsRead.mockResolvedValue(undefined);
    whatsapp.sendText.mockResolvedValue('id');
    service = new ProcessingIndicatorService(whatsapp as any, config as any);
  });

  afterEach(() => jest.useRealTimers());

  it('dispara typing indicator al comenzar', () => {
    service.begin('59171000001', 'msg-1');
    expect(whatsapp.markAsRead).toHaveBeenCalledWith('msg-1', true);
  });

  it('envía el aviso interino si se supera el umbral', () => {
    service.begin('59171000001', 'msg-1');
    jest.advanceTimersByTime(150);
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '59171000001', expect.stringContaining('⏳'),
    );
  });

  it('NO envía el aviso si stop() llega antes del umbral', () => {
    const stop = service.begin('59171000001', 'msg-1');
    jest.advanceTimersByTime(50);
    stop();
    jest.advanceTimersByTime(200);
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('NO envía el aviso si stop() llega justo cuando el timer dispara (guard finished)', () => {
    const stop = service.begin('59171000001', 'msg-1');
    stop();
    jest.advanceTimersByTime(200);
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('un fallo del typing indicator no rompe el flujo', () => {
    whatsapp.markAsRead.mockRejectedValue(new Error('API vieja'));
    expect(() => service.begin('59171000001', 'msg-1')).not.toThrow();
  });
});
