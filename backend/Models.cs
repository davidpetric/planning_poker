namespace PlanningPoker.Server;

public class Player
{
    public string Id { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string? Vote { get; set; }
    public bool IsHost { get; set; }
}

public class Room
{
    public string Id { get; set; } = default!;
    public string Name { get; set; } = default!;
    public List<Player> Players { get; set; } = new();
    public bool Revealed { get; set; }
    public string[] CardValues { get; set; } = Array.Empty<string>();
}

public static class Cards
{
    public static readonly string[] Fibonacci =
        { "0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?" };
}
