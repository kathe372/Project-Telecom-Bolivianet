using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Characterization;

/// <summary>
/// TEST DE CARACTERIZACIÓN — Fase 0 del plan de mejora técnica.
///
/// No comprueba que la facturación sea CORRECTA: comprueba que hace EXACTAMENTE
/// lo que hace hoy. Los valores esperados se tomaron de la ejecución actual, no
/// de lo que "debería" salir. Si al refactorizar BillingService (F4 y F5) alguno
/// de estos números cambia, el refactor alteró comportamiento y hay que pararlo.
///
/// Cubre las cuatro decisiones que toma GenerateMonthlyInvoicesAsync y que están
/// repartidas entre el servicio, BillingEligibility y el libro mayor de crédito:
///   1. A quién se factura (solo estados facturables: los suspendidos NO).
///   2. Cuánto (precio del plan, con prorrateo el primer mes).
///   3. Qué pasa con el saldo a favor (se consume y deja asiento).
///   4. Qué estado inicial lleva la factura según si el crédito la cubre entera.
///
/// Si al leerlo te parece que algún comportamiento es un bug, NO lo arregles
/// aquí: anótalo en BUGS_DESCUBIERTOS.md. Arreglar y refactorizar a la vez es
/// como se rompen los sistemas en producción.
/// </summary>
public class BillingCharacterizationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public BillingCharacterizationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private const int    Anio        = 2026;
    private const int    Mes         = 3;
    private const decimal PrecioPlan = 149m;

    private sealed record Escenario(
        IServiceScope Scope, AppDbContext Db,
        Guid Activo, Guid Suspendido, Guid ConCredito, Guid DadoDeBaja);

    /// <summary>
    /// Cuatro clientes que cubren cada rama alcanzable de la decisión. Las fechas
    /// de instalación son MUY anteriores al mes facturado para que no se dispare
    /// el prorrateo del primer mes (eso se prueba aparte, más abajo).
    ///
    /// No se siembra un "cliente sin plan": la FK Clients→Plans lo impide, así que
    /// la rama `client.Plan is null` de BillingService es INALCANZABLE en la base
    /// real. Ver D-08 en BUGS_DESCUBIERTOS.md.
    /// </summary>
    private async Task<Escenario> SeedAsync()
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            DELETE FROM "NotifLogs";
            DELETE FROM "NotifOutbox";
            DELETE FROM "PaymentInvoices";
            DELETE FROM "Payments";
            DELETE FROM "Invoices";
            DELETE FROM "CreditMovements";
            DELETE FROM "Clients";
            DELETE FROM "Plans";
            DELETE FROM "UserSystems";
            """);

        var userId = Guid.NewGuid();
        var planId = Guid.NewGuid();

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = userId, FullName = "Operador Caracterización",
            Email = $"carac-{userId:N}@test.bo", PasswordHash = "x",
            Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Plata", SpeedMb = 50,
            MonthlyPrice = PrecioPlan, IsActive = true,
        });

        var instalacion = new DateTime(2025, 6, 15, 0, 0, 0, DateTimeKind.Utc);

        // IdentityCard y WinboxNumber tienen índice único: cada cliente necesita
        // los suyos o el seed revienta con 23505.
        var n = 0;
        Client Nuevo(string tbn, string nombre, Guid? plan = null)
        {
            n++;
            var c = Client.Create(tbn, nombre, $"900000{n}", $"5917000000{n}", "Zona Sur",
                                  instalacion, userId, plan ?? planId);
            c.WinboxNumber = $"WB-{tbn}";
            db.Set<Client>().Add(c);
            return c;
        }

        var activo      = Nuevo("TBN-C001", "Cliente Activo");
        var suspendido  = Nuevo("TBN-C002", "Cliente Suspendido");
        var conCredito  = Nuevo("TBN-C003", "Cliente Con Credito");
        var dadoDeBaja  = Nuevo("TBN-C004", "Cliente Dado De Baja");

        suspendido.Suspend();
        dadoDeBaja.Cancel();
        conCredito.CreditBalance = 200m;   // más que el precio del plan: lo cubre entero

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, db, activo.Id, suspendido.Id, conCredito.Id, dadoDeBaja.Id);
    }

    private static Task<TelecomBoliviaNet.Application.DTOs.Invoices.BillingJobResultDto>
        FacturarAsync(Escenario esc) =>
        esc.Scope.ServiceProvider.GetRequiredService<IBillingService>()
            .GenerateMonthlyInvoicesAsync(Anio, Mes, null, "Caracterización");

    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Solo_se_factura_a_los_clientes_facturables()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var result = await FacturarAsync(esc);

        // 2 generadas: el activo y el que tiene crédito. El suspendido NO se
        // factura (congelamiento de facturación en suspensión) y el dado de baja
        // tampoco.
        result.Generated.Should().Be(2);
        result.Skipped.Should().Be(0);
        result.Errors.Should().Be(0);
        result.ExcludedBaja.Should().Be(1);

        var facturados = await esc.Db.Set<Invoice>().AsNoTracking()
            .Where(i => i.Year == Anio && i.Month == Mes)
            .Select(i => i.ClientId).ToListAsync();

        facturados.Should().BeEquivalentTo(new[] { esc.Activo, esc.ConCredito });
        facturados.Should().NotContain(esc.Suspendido);
        facturados.Should().NotContain(esc.DadoDeBaja);
    }

    [Fact]
    public async Task El_cliente_activo_se_factura_al_precio_del_plan()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await FacturarAsync(esc);

        var factura = await esc.Db.Set<Invoice>().AsNoTracking()
            .SingleAsync(i => i.ClientId == esc.Activo && i.Year == Anio && i.Month == Mes);

        factura.Amount.Should().Be(PrecioPlan);
        factura.AmountPaid.Should().Be(0m);
        factura.CreditApplied.Should().Be(0m);
        factura.Status.Should().Be(InvoiceStatus.Emitida);
        factura.Type.Should().Be(InvoiceType.Mensualidad);
        // Snapshot del plan: permite explicar diferencias de importe si el plan cambia después.
        factura.PlanName.Should().Be("Plan Plata");
        factura.PlanPrice.Should().Be(PrecioPlan);
        // Vencimiento el día 5 del mes facturado.
        factura.DueDate.Day.Should().Be(5);
        factura.Notes.Should().BeNull("sin prorrateo cuando la instalación es de meses anteriores");
    }

    [Fact]
    public async Task El_saldo_a_favor_cubre_la_factura_y_la_deja_pagada()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await FacturarAsync(esc);

        var factura = await esc.Db.Set<Invoice>().AsNoTracking()
            .SingleAsync(i => i.ClientId == esc.ConCredito && i.Year == Anio && i.Month == Mes);

        // El crédito (200) supera al importe (149): se consume solo lo necesario
        // y la factura nace PAGADA.
        factura.Amount.Should().Be(PrecioPlan);
        factura.AmountPaid.Should().Be(PrecioPlan);
        factura.CreditApplied.Should().Be(PrecioPlan);
        factura.Status.Should().Be(InvoiceStatus.Pagada);

        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ConCredito);
        cliente.CreditBalance.Should().Be(200m - PrecioPlan);
    }

    [Fact]
    public async Task El_consumo_de_credito_deja_asiento_en_el_libro_mayor()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await FacturarAsync(esc);

        // Antes el saldo se restaba a mano y el consumo no quedaba registrado en
        // ningún sitio. Este test congela que sí queda.
        var movimientos = await esc.Db.Set<CreditMovement>().AsNoTracking()
            .Where(m => m.ClientId == esc.ConCredito).ToListAsync();

        movimientos.Should().ContainSingle();
        movimientos[0].Amount.Should().Be(-PrecioPlan, "el asiento descuenta, por eso es negativo");
        movimientos[0].Type.Should().Be(CreditMovementType.AplicadoAFactura);
    }

    [Fact]
    public async Task Facturar_dos_veces_el_mismo_mes_no_duplica_facturas()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await FacturarAsync(esc);
        var segunda = await FacturarAsync(esc);

        segunda.Generated.Should().Be(0);
        segunda.Skipped.Should().Be(2, "los dos ya facturados se omiten");

        var total = await esc.Db.Set<Invoice>().AsNoTracking()
            .CountAsync(i => i.Year == Anio && i.Month == Mes);
        total.Should().Be(2);
    }

    [Fact]
    public async Task El_primer_mes_se_factura_prorrateado_por_dias_restantes()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        // Se mueve la instalación del cliente activo AL mes que se va a facturar
        // para disparar la rama de prorrateo.
        var cliente = await esc.Db.Set<Client>().SingleAsync(c => c.Id == esc.Activo);
        cliente.InstallationDate = new DateTime(Anio, Mes, 15, 0, 0, 0, DateTimeKind.Utc);
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        await FacturarAsync(esc);

        var factura = await esc.Db.Set<Invoice>().AsNoTracking()
            .SingleAsync(i => i.ClientId == esc.Activo && i.Year == Anio && i.Month == Mes);

        // Marzo tiene 31 días; instalado el 15 quedan 17 (incluye el día de alta).
        // 149 * 17 / 31 = 81.7096... → 81.71
        factura.Amount.Should().Be(81.71m);
        factura.Notes.Should().Be("Mes proporcional: 17 de 31 días");
    }
}
