using Moq;

namespace TelecomBoliviaNet.UnitTests.Helpers;

/// <summary>
/// Base class for unit tests. Provides strict mocks to catch unexpected calls early.
/// </summary>
public abstract class ServiceTestBase
{
    protected Mock<T> MockOf<T>() where T : class => new Mock<T>(MockBehavior.Strict);
}
