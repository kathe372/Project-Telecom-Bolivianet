using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Infrastructure.Jobs;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Services;

public sealed class SequenceGenerator : ISequenceGenerator
{
    private readonly AppDbContext _db;

    public SequenceGenerator(AppDbContext db) => _db = db;


    private async Task EnsureSequenceAsync(string seqName)
    {
        // S-03 — La lista blanca ya existía (ValidateSequenceName) pero solo se
        // aplicaba en NextVal. El nombre entra en SQL por interpolación y el aviso
        // EF1002 que lo señalaría está apagado abajo, así que la guarda tiene que
        // estar en TODAS las rutas, no en una.
        ValidateSequenceName(seqName);

        #pragma warning disable EF1002
        await _db.Database.ExecuteSqlRawAsync(
            $"CREATE SEQUENCE IF NOT EXISTS \"{seqName}\" START 1 INCREMENT 1");
        #pragma warning restore EF1002
    }

    /// <summary>
    /// Reinicia la numeración cuando cambia el año.
    /// </summary>
    /// <remarks>
    /// S-02 — Esto se coordina entre RÉPLICAS, no solo dentro del proceso.
    ///
    /// <para>Antes usaba un <c>SemaphoreSlim</c> estático, que es local al
    /// proceso y no impide nada entre instancias. El 1 de enero, con dos réplicas
    /// conviviendo —un despliegue basta—, ambas leían "último año = el anterior",
    /// ambas pasaban la doble comprobación, cada una tomaba SU propio semáforo y
    /// ambas ejecutaban <c>ALTER SEQUENCE ... RESTART WITH 1</c>. La segunda
    /// reiniciaba una secuencia de la que la primera ya había repartido números:
    /// numeración duplicada.</para>
    ///
    /// <para>F2 resolvió exactamente esto para los 11 jobs con advisory locks de
    /// PostgreSQL. Este generador se había quedado fuera; ahora usa la misma
    /// pieza.</para>
    ///
    /// <para>Si otra réplica tiene el lease, ésta no reinicia —correcto, ya lo
    /// está haciendo la otra— y espera brevemente a que publique el año nuevo
    /// antes de seguir. No se bloquea indefinidamente: pasado el margen continúa,
    /// porque emitir un número del rango viejo es molesto pero no rompe nada
    /// (el índice único de InvoiceNumber sigue en pie).</para>
    /// </remarks>
    private async Task ResetIfYearChangedAsync(string seqName, string configKey)
    {
        var currentYear = DateTime.UtcNow.Year.ToString();

        if (await AnioPublicadoAsync(configKey) == currentYear) return;

        var loHiceYo = await JobLease.TryRunExclusiveAsync(
            _db,
            $"seq-reset:{configKey}",
            async () =>
            {
                // Dentro del lease: nadie más puede estar reiniciando ahora.
                if (await AnioPublicadoAsync(configKey) == currentYear) return;

                // Misma guarda que en NextVal: esta ruta corre ANTES que aquélla.
                ValidateSequenceName(seqName);

                var nombre = seqName;
                #pragma warning disable EF1002
                await _db.Database.ExecuteSqlRawAsync(
                    $"CREATE SEQUENCE IF NOT EXISTS \"{nombre}\" START 1 INCREMENT 1");
                await _db.Database.ExecuteSqlRawAsync(
                    $"ALTER SEQUENCE \"{nombre}\" RESTART WITH 1");
                #pragma warning restore EF1002

                var cfg = await _db.SystemConfigs.FirstOrDefaultAsync(c => c.Key == configKey);
                if (cfg is null)
                    _db.SystemConfigs.Add(new TelecomBoliviaNet.Domain.Entities.Admin.SystemConfig
                        { Key = configKey, Value = currentYear });
                else
                    cfg.Value = currentYear;
                await _db.SaveChangesAsync();
            });

        if (loHiceYo) return;

        // Otra réplica lo está haciendo. Se le da un margen corto para que
        // publique el año; si no llega, se sigue igual.
        for (var intento = 0; intento < 10; intento++)
        {
            await Task.Delay(200);
            if (await AnioPublicadoAsync(configKey) == currentYear) return;
        }
    }

    private Task<string?> AnioPublicadoAsync(string configKey)
        => _db.SystemConfigs
            .Where(c => c.Key == configKey)
            .Select(c => c.Value)
            .FirstOrDefaultAsync();

    public async Task<string> NextInvoiceNumberAsync(bool isExtraordinary = false)
    {
        var seqName   = isExtraordinary ? "invoice_extra_seq" : "invoice_number_seq";
        var configKey = isExtraordinary ? "seq.invoice_extra.year" : "seq.invoice.year";
        await ResetIfYearChangedAsync(seqName, configKey);
        var next   = await NextVal(seqName);
        var prefix = isExtraordinary ? "FE" : "F";
        return $"{prefix}-{DateTime.UtcNow.Year}-{next:D4}";
    }

    public async Task<string> NextTicketNumberAsync()
    {
        await ResetIfYearChangedAsync("ticket_number_seq", "seq.ticket.year");
        var next = await NextVal("ticket_number_seq");
        return $"TK-{DateTime.UtcNow.Year}-{next:D4}";
    }

    public async Task<string> NextReceiptNumberAsync()
    {
        await ResetIfYearChangedAsync("receipt_number_seq", "seq.receipt.year");
        var next = await NextVal("receipt_number_seq");
        return $"REC-{DateTime.UtcNow.Year}-{next:D4}";
    }

    private static void ValidateSequenceName(string sequenceName)
    {
        var allowed = new[]
        {
            "invoice_number_seq", "invoice_extra_seq",
            "ticket_number_seq", "receipt_number_seq"
        };
        if (!allowed.Contains(sequenceName))
            throw new InvalidOperationException("Operación de secuencia no válida.");
    }

    private async Task<long> NextVal(string sequenceName)
    {
        ValidateSequenceName(sequenceName);
        await EnsureSequenceAsync(sequenceName);

        #pragma warning disable EF1002
        var result = await _db.Database
            .SqlQueryRaw<long>($"SELECT nextval('{sequenceName}') AS \"Value\"")
            .FirstAsync();
        #pragma warning restore EF1002

        return result;
    }
}
