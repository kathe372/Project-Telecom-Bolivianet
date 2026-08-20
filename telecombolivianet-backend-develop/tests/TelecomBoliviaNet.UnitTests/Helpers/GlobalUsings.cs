global using Xunit;
global using Moq;
global using FluentAssertions;
global using TelecomBoliviaNet.UnitTests.Helpers;

// Dominio y utilidades de test usadas transversalmente en la suite
global using MockQueryable;                                      // BuildMock()
global using MockQueryable.Moq;                                  // BuildMockDbSet()/.Object
global using TelecomBoliviaNet.Domain.Entities.Plans;           // Plan
global using TelecomBoliviaNet.Domain.Entities.Notifications;   // NotifType
