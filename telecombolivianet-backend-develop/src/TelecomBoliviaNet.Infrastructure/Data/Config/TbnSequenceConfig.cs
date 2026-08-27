using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="TbnSequence"/>. Movido desde AppDbContext (F5.4).</summary>
public class TbnSequenceConfig : IEntityTypeConfiguration<TbnSequence>
{
    public void Configure(EntityTypeBuilder<TbnSequence> e)
    {
            e.ToTable("TbnSequences");
            e.HasKey(t => t.Id);
            e.Property(t => t.Prefix).HasMaxLength(10);
        
        e.HasData(new TbnSequence { Id = 1, LastValue = 0, Prefix = "TBN" });;
    }
}
