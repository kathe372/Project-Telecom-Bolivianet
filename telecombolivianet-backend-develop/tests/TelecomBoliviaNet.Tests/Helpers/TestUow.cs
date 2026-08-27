using Moq;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Tests.Helpers;

/// <summary>
/// Dobles de <see cref="IUnitOfWork"/> para los handlers que envuelven sus
/// escrituras en una transacción (D-13).
/// </summary>
public static class TestUow
{
    /// <summary>
    /// No estorba: empezar, confirmar y deshacer no hacen nada. Es lo que quiere
    /// un test que comprueba el resultado de la operación, no su transaccionalidad.
    /// </summary>
    public static IUnitOfWork Noop() => Mock().Object;

    /// <summary>
    /// El mock, para cuando el test necesita <b>verificar</b> que se confirmó o
    /// se deshizo — que es la mitad interesante de D-13.
    /// </summary>
    public static Mock<IUnitOfWork> Mock()
    {
        var uow = new Mock<IUnitOfWork>();
        uow.Setup(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()))
           .Returns(Task.CompletedTask);
        uow.Setup(u => u.CommitAsync(It.IsAny<CancellationToken>()))
           .Returns(Task.CompletedTask);
        uow.Setup(u => u.RollbackAsync(It.IsAny<CancellationToken>()))
           .Returns(Task.CompletedTask);
        return uow;
    }
}
