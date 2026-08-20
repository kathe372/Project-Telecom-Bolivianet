namespace TelecomBoliviaNet.Application.DTOs.Common;

public record PagedResult<T>(
    IEnumerable<T> Items,
    int TotalCount,
    int PageNumber,
    int PageSize
)
{
    public const int MaxPageSize = 100;

    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
    public bool HasPreviousPage => PageNumber > 1;
    public bool HasNextPage => PageNumber < TotalPages;
}

public record PaginationParams
{
    private int _pageNumber = 1;
    private int _pageSize   = 20;

    public int PageNumber
    {
        get => _pageNumber;
        init => _pageNumber = value < 1 ? 1 : value;
    }

    public int PageSize
    {
        get => _pageSize;
        init => _pageSize = value < 1 ? 20
                          : value > PagedResult<object>.MaxPageSize ? PagedResult<object>.MaxPageSize
                          : value;
    }
}

