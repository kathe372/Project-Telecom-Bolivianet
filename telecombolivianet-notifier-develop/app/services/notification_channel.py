from typing import Protocol, runtime_checkable


@runtime_checkable
class NotificationChannel(Protocol):
    """
    Interfaz de un canal de envío de notificaciones.
    Cualquier clase que implemente send() y close() cumple este Protocol
    sin necesidad de herencia explícita (structural subtyping).
    """

    async def send(self, phone: str, message: str) -> None:
        """
        Envía un mensaje al destinatario identificado por phone.

        Lanza:
          RateLimitError        — si el canal impone rate limiting
          Exception             — cualquier error de envío no recuperable
        """
        ...

    async def close(self) -> None:
        """Libera recursos del canal (conexiones HTTP, sockets, etc.)."""
        ...
