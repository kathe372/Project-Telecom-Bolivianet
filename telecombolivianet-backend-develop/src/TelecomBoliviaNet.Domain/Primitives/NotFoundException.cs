namespace TelecomBoliviaNet.Domain.Primitives;

public sealed class NotFoundException : Exception
{
    public NotFoundException(string message) : base(message) { }

    public static NotFoundException For(string resource, object id)
        => new($"{resource} con id '{id}' no encontrado.");
}
