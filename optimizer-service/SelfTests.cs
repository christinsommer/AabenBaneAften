namespace HIkOptimizer;

public static class SelfTests
{
    static Player P(int id, int hours = 1, string[]? times = null, string status = "active", int cr = 5, string gender = "M", int? age = 40, string? member = null) =>
        new(id, member ?? id.ToString(), cr, gender, age, times ?? new[] { "18:00", "18:30", "19:00", "20:00" }, hours, id, status);
    static Input Data(Player[] players, Slot[] slots, Weights? weights = null, Round[]? history = null, Match[]? locked = null) => new(players, slots, history ?? [], locked ?? [], weights ?? new());
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static int Count(Result result, int id) => result.Matches.Count(m => m.Team1.Contains(id) || m.Team2.Contains(id));
    public static void Run()
    {
        var oneCourt = new[] { new Slot(1, "18:00") };
        var slots = new[] { new Slot(1, "18:00"), new Slot(5, "18:30"), new Slot(1, "19:00"), new Slot(1, "20:00") };
        var priorities = Scheduler.Solve(Data(Enumerable.Range(1, 4).Select(i => P(i, 3)).ToArray(), slots), 30);
        Check(Enumerable.Range(1, 4).All(id => Count(priorities, id) == 3), "Must fulfil three hours without half-hour overlap");
        Check(priorities.Matches.All(m => m.StartTime != "18:30"), "18:30 cannot overlap 18:00 or 19:00");
        var queue = Scheduler.Solve(Data(Enumerable.Range(1, 6).Select(i => P(i)).ToArray(), oneCourt), 30);
        Check(Enumerable.Range(1, 4).All(id => Count(queue, id) == 1) && Count(queue, 5) == 0 && Count(queue, 6) == 0, "Earlier signup wins shortage");
        var waiting = Scheduler.Solve(Data(new[] {P(10), P(11), P(12), P(13), P(1, status:"waitlist"), P(2, status:"waitlist")}, oneCourt), 30);
        Check(Count(waiting, 1) == 0 && Count(waiting, 2) == 0, "Waitlist cannot displace active signups");
        var shortage = Scheduler.Solve(Data(Enumerable.Range(1,6).Select(i=>P(i,2)).ToArray(), [new Slot(1,"18:00"),new Slot(1,"19:00")]),30);
        Check(Enumerable.Range(1,6).All(id=>Count(shortage,id)>=1) && Enumerable.Range(1,6).Count(id=>Count(shortage,id)==2)==2, "Everyone's first hour precedes second hours");
        var activeSecond = Scheduler.Solve(Data(new[] {P(10,2),P(11,2),P(12,2),P(13,2),P(1,status:"waitlist"),P(2,status:"waitlist")}, [new Slot(1,"18:00"),new Slot(1,"19:00")]),30);
        Check(Enumerable.Range(10,4).All(id=>Count(activeSecond,id)==2) && Count(activeSecond,1)==0 && Count(activeSecond,2)==0, "Active second hours precede any waitlist hours");
        var negativeScore = Scheduler.Solve(Data(new[] {P(1,cr:1),P(2,cr:1),P(3,cr:1),P(4,cr:4)},oneCourt),30);
        Check(Enumerable.Range(1,4).All(id=>Count(negativeScore,id)==1) && negativeScore.Score<0, "Negative match score must not sacrifice first-hour coverage");
        var gap = Scheduler.Solve(Data(new[] {P(1, cr:1), P(2, cr:1), P(3, cr:5), P(4, cr:5)}, oneCourt), 30);
        Check(gap.Matches.All(m => m.Team1.Length == 1), "CR gap >3 must prohibit doubles");
        var boundary = Scheduler.Solve(Data(new[] {P(1, cr:1), P(2, cr:1), P(3, cr:4), P(4, cr:4)}, oneCourt), 30);
        Check(boundary.Matches.Single().Team1.Length == 2, "CR gap =3 must be allowed");
        var banned = Scheduler.Solve(Data(new[] {P(1, member:"17108"), P(2, member:"13993"), P(3), P(4)}, oneCourt), 30);
        Check(!banned.Matches.Any(m => m.Team1.Concat(m.Team2).Contains(1) && m.Team1.Concat(m.Team2).Contains(2)), "Forbidden member pair");
        var unavailable = Scheduler.Solve(Data(new[] {P(1, times:["19:00"]), P(2), P(3), P(4)}, oneCourt), 30);
        Check(Count(unavailable, 1) == 0, "Must never use unavailable time");
        var mixed = Scheduler.Solve(Data(new[] {P(1, gender:"K"), P(2, gender:"K"), P(3), P(4)}, oneCourt), 30);
        Check(mixed.Score == 100 && mixed.Matches.Single().Team1.Count(id => id <= 2) == 1, "Mixed must split genders between teams");
        var history = new[] {new Round("2026-09-18", [new HistoryMatch([1,2], [3,4])])};
        var lockMatch = new Match(1, "18:00", [1,2], [3,4]);
        var historical = Scheduler.Solve(Data(Enumerable.Range(1,4).Select(i=>P(i)).ToArray(), oneCourt, history:history, locked:[lockMatch]), 30);
        Check(historical.Score == 10, "Two repeated partners get both penalties, four repeated opponent pairs: 100-40-20-20-10");
        var aged = Scheduler.Solve(Data(new[] {P(1, age:20), P(2, age:40), P(3, age:50), P(4, age:70)}, oneCourt, new Weights(FactorAge:1), locked:[lockMatch]), 30);
        var variedCr = new[] {P(1,cr:2), P(2,cr:5), P(3,cr:3), P(4,cr:4)};
        var sameTeam = Scheduler.Solve(Data(variedCr, oneCourt, locked:[lockMatch]),30);
        Check(sameTeam.Score == 30, "Both team differences: 100-10-15*(3+1)=30");
        var noSameTeam = Scheduler.Solve(Data(variedCr, oneCourt, new Weights(FactorSameTeamDifference:0), locked:[lockMatch]),30);
        Check(noSameTeam.Score == 90, "Zero factor disables same-team difference");
        var preferSimilar = Scheduler.Solve(Data(variedCr, oneCourt, new Weights(FactorMatchDifference:0)),30);
        Check(preferSimilar.Score == 60, "Solver prefers similar partners: 100-10-15*(1+1)=60");
        Check(aged.Score == -10, "Age: 20+20+abs(60-120)=100, score 100-10-100");
        var early = Scheduler.Solve(Data(new[] {P(1), P(2)}, [new Slot(1,"18:00"), new Slot(1,"19:00")]), 30);
        Check(early.Matches.Single().StartTime == "18:00", "Earliest of equal-score plans");
        Check(early.Status == "OPTIMAL", "Tiny model must prove all stages optimal");
        var scoreBeforeEarly = Scheduler.Solve(Data(new[] {P(1,cr:1),P(2,cr:1),P(3,cr:4),P(4,cr:4)}, [new Slot(1,"18:00"),new Slot(1,"19:00")]),30);
        Check(scoreBeforeEarly.Score == 100 && scoreBeforeEarly.Matches.Length == 2, "Two balanced singles score 100 and must outrank an earlier double scoring 90");
        Console.WriteLine("PASS: hours, overlaps, queue, waitlist, CR limits, forbidden pairs, availability, mix, history, age, early times and optimality.");
    }
}
