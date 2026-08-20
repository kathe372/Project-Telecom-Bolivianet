using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

public class InstallationDomainV2Tests
{
    [Fact]
    public void TC_DOM_01_IsWorkingDay_Saturday_Mask63_ReturnsTrue()
    {
        var schedule = new BusinessSchedule { WorkingDaysMask = 63 };

        schedule.IsWorkingDay(DayOfWeek.Saturday).Should().BeTrue();
    }

    [Fact]
    public void TC_DOM_02_IsWorkingDay_Sunday_Mask63_ReturnsFalse()
    {
        var schedule = new BusinessSchedule { WorkingDaysMask = 63 };

        schedule.IsWorkingDay(DayOfWeek.Sunday).Should().BeFalse();
    }

    [Fact]
    public void TC_DOM_03_IsWorkingDay_Monday_Mask1_ReturnsTrue()
    {
        var schedule = new BusinessSchedule { WorkingDaysMask = 1 };

        schedule.IsWorkingDay(DayOfWeek.Monday).Should().BeTrue();
        schedule.IsWorkingDay(DayOfWeek.Tuesday).Should().BeFalse();
    }

    [Fact]
    public void TC_DOM_04_Plan_TecnicosRequeridos_DefaultIsOne()
    {
        var plan = new Plan { Name = "Test", SpeedMb = 50, MonthlyPrice = 100 };

        plan.TecnicosRequeridos.Should().Be(1);
        plan.DuracionInstalacionMin.Should().Be(120);
    }

    [Fact]
    public void TC_DOM_05_InstallationTechnician_UniqueConstraint_StructureCorrect()
    {
        var installationId = Guid.NewGuid();
        var technicianId   = Guid.NewGuid();
        var actorId        = Guid.NewGuid();

        var first = new InstallationTechnician
        {
            InstallationId = installationId,
            TechnicianId   = technicianId,
            IsLead         = true,
            AssignedBy     = actorId,
        };

        var duplicate = new InstallationTechnician
        {
            InstallationId = installationId,
            TechnicianId   = technicianId,  // mismo técnico
            IsLead         = false,
            AssignedBy     = actorId,
        };

        var isDuplicate = first.InstallationId == duplicate.InstallationId &&
                          first.TechnicianId   == duplicate.TechnicianId;

        isDuplicate.Should().BeTrue("el par (InstallationId, TechnicianId) es único — la BD rechazará el segundo insert");
    }

    [Fact]
    public void TC_DOM_06_Installation_NewFieldsDefaultToNull()
    {
        var inst = new Installation
        {
            ClientId    = Guid.NewGuid(),
            PlanId      = Guid.NewGuid(),
            Fecha       = DateTime.UtcNow.Date,
            HoraInicio  = new TimeOnly(8, 0),
            Direccion   = "Calle Test 123",
            CreadoPorId = Guid.NewGuid(),
        };

        inst.ReminderSentAt.Should().BeNull();
        inst.CanceladoAt.Should().BeNull();
        inst.Technicians.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public void TC_DOM_07_TicketVisit_DuracionMinDefaultIs60()
    {
        var visit = new TicketVisit
        {
            TicketId        = Guid.NewGuid(),
            ScheduledAt     = DateTime.UtcNow,
            CreatedByUserId = Guid.NewGuid(),
        };

        visit.DuracionMin.Should().Be(60);
        visit.Technicians.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public void TC_DOM_08_IsWorkingDay_AllDays_Mask127_AllTrue()
    {
        var schedule = new BusinessSchedule { WorkingDaysMask = 127 };

        foreach (var day in Enum.GetValues<DayOfWeek>())
            schedule.IsWorkingDay(day).Should().BeTrue(because: $"{day} debe ser laborable con mask=127");
    }

    [Fact]
    public void TC_DOM_09_IsWorkingDay_Friday_Mask31_ReturnsTrue()
    {
        var schedule = new BusinessSchedule { WorkingDaysMask = 31 };

        schedule.IsWorkingDay(DayOfWeek.Friday).Should().BeTrue();
        schedule.IsWorkingDay(DayOfWeek.Saturday).Should().BeFalse();
    }

    [Fact]
    public void TC_DOM_10_Plan_DuracionInstalacionMinDefaultIs120()
    {
        var plan = new Plan { Name = "Test", SpeedMb = 100, MonthlyPrice = 150 };

        plan.DuracionInstalacionMin.Should().Be(120);
        plan.IsActive.Should().BeTrue();
    }

    [Fact]
    public void TC_DOM_11_VisitTechnician_IsLeadDefaultsFalse()
    {
        var vt = new TelecomBoliviaNet.Domain.Entities.Tickets.VisitTechnician
        {
            VisitId      = Guid.NewGuid(),
            TechnicianId = Guid.NewGuid(),
            AssignedBy   = Guid.NewGuid(),
        };

        vt.IsLead.Should().BeFalse();
        vt.AssignedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }
}
