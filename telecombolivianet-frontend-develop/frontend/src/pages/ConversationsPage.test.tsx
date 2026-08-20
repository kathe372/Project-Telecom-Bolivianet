import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConversationsPage from './ConversationsPage';
import { chatbotService } from '@/services/chatbotService';

vi.mock('@/services/chatbotService', () => ({
  chatbotService: {
    getConversaciones:    vi.fn(),
    getStats:             vi.fn(),
    getConversacion:      vi.fn(),
    tomarConversacion:    vi.fn(),
    devolverConversacion: vi.fn(),
    sendMessage:          vi.fn(),
  },
}));

vi.mock('@/hooks/useAdminHub', () => ({
  useAdminHub: () => ({ status: 'connected' }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({}),
}));

const NOW = new Date().toISOString();

const CONVS = {
  Items: [
    { Id: 'c1', PhoneNumber: '59171435981', ClientName: 'Ana Rosales', UpdatedAt: NOW, UltimoMensaje: 'Hola, necesito ayuda', IsEscalated: false },
    { Id: 'c2', PhoneNumber: '59165397071', ClientName: 'Pedro Quispe', UpdatedAt: NOW, UltimoMensaje: null, IsEscalated: true },
  ],
  Total: 2,
};

const STATS = { HoyConversaciones: 5, Escaladas: 1 };

const makeDetail = (escalated: boolean) => ({
  PhoneNumber: '59171435981', ClientName: 'Ana Rosales',
  IsEscalated: escalated, AgentName: escalated ? 'Admin' : null,
  Messages: [
    { Id: 'm1', Role: 'user', Content: 'Hola, necesito ayuda', CreatedAt: NOW, MediaType: null, MediaUrl: null },
    { Id: 'm2', Role: 'bot', Content: 'Hola, ¿en qué puedo ayudarte?', CreatedAt: NOW, MediaType: null, MediaUrl: null },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (chatbotService.getConversaciones as ReturnType<typeof vi.fn>).mockResolvedValue(CONVS);
  (chatbotService.getStats as ReturnType<typeof vi.fn>).mockResolvedValue(STATS);
  (chatbotService.getConversacion as ReturnType<typeof vi.fn>).mockResolvedValue(makeDetail(false));
  (chatbotService.tomarConversacion as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (chatbotService.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('ConversationsPage — TC-FE-CONV-01 a TC-FE-CONV-06 (red de seguridad refactor C5)', () => {
  it('TC-FE-CONV-01 — lista conversaciones con stats y estado escalada', async () => {
    render(<ConversationsPage />);
    expect(await screen.findByText('Ana Rosales')).toBeInTheDocument();
    expect(screen.getByText('Pedro Quispe')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Hoy')).toBeInTheDocument();
    expect(screen.getByText('Escalada')).toBeInTheDocument();
    expect(screen.getByText('Sin mensajes')).toBeInTheDocument();
  });

  it('TC-FE-CONV-02 — muestra error si la carga falla', async () => {
    (chatbotService.getConversaciones as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
    render(<ConversationsPage />);
    expect(await screen.findByText('Error al cargar las conversaciones.')).toBeInTheDocument();
  });

  it('TC-FE-CONV-03 — seleccionar conversación carga mensajes y acción de tomar', async () => {
    render(<ConversationsPage />);
    fireEvent.click(await screen.findByText('Ana Rosales'));
    await waitFor(() => expect(chatbotService.getConversacion).toHaveBeenCalledWith('59171435981'));
    expect(await screen.findByText('Hola, ¿en qué puedo ayudarte?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tomar conversación/ })).toBeInTheDocument();
  });

  it('TC-FE-CONV-04 — tomar conversación habilita composer y devolver al bot', async () => {
    render(<ConversationsPage />);
    fireEvent.click(await screen.findByText('Ana Rosales'));
    await screen.findByRole('button', { name: /Tomar conversación/ });

    (chatbotService.getConversacion as ReturnType<typeof vi.fn>).mockResolvedValue(makeDetail(true));
    fireEvent.click(screen.getByRole('button', { name: /Tomar conversación/ }));

    await waitFor(() => expect(chatbotService.tomarConversacion).toHaveBeenCalledWith('59171435981'));
    expect(await screen.findByRole('button', { name: /Devolver al bot/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Escribe un mensaje/)).toBeInTheDocument();
    expect(screen.getByText(/Bot silenciado/)).toBeInTheDocument();
  });

  it('TC-FE-CONV-05 — enviar mensaje llama al servicio con el texto', async () => {
    (chatbotService.getConversacion as ReturnType<typeof vi.fn>).mockResolvedValue(makeDetail(true));
    render(<ConversationsPage />);
    fireEvent.click(await screen.findByText('Ana Rosales'));
    const textarea = await screen.findByPlaceholderText(/Escribe un mensaje/);

    fireEvent.change(textarea, { target: { value: 'Buenos días, le ayudo' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() =>
      expect(chatbotService.sendMessage).toHaveBeenCalledWith('59171435981', 'Buenos días, le ayudo'));
  });

  it('TC-FE-CONV-06 — la búsqueda filtra por nombre o teléfono', async () => {
    render(<ConversationsPage />);
    await screen.findByText('Ana Rosales');
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o teléfono…'), {
      target: { value: 'Pedro' },
    });
    expect(screen.getByText('Pedro Quispe')).toBeInTheDocument();
    expect(screen.queryByText('Ana Rosales')).not.toBeInTheDocument();
  });
});
