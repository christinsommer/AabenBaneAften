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
        var resourceInput = Data(Enumerable.Range(1,4).Select(i=>P(i)).ToArray(),oneCourt) with {OptimizerResources=new(1,10)};
        Check(Scheduler.Solve(resourceInput).Matches.Length==1,"Configured CPU and time can solve a round");
        Check(Scheduler.Solve(resourceInput with {OptimizerResources=new(1,900)}).Matches.Length==1,"900 second limit is accepted");
        foreach(var resources in new[] {new OptimizerResources(0,600),new OptimizerResources(33,600),new OptimizerResources(4,0),new OptimizerResources(4,901)}) {
            var rejected=false;
            try {Scheduler.Solve(resourceInput with {OptimizerResources=resources});} catch(ArgumentException) {rejected=true;}
            Check(rejected,"Invalid CPU or time must be rejected");
        }
        var summerPlayers=Enumerable.Range(1,4).Select(i=>P(i,times:["17:30","18:00"])).ToArray();
        var summer=Scheduler.Solve(Data(summerPlayers,[new Slot(12,"17:30"),new Slot(8,"17:30")]),30);
        Check(summer.Matches.Length==1 && summer.Matches[0].Court==12,"Summer court numbers and administrator priority are respected");
        var shared=Scheduler.Solve(Data(Enumerable.Range(1,8).Select(i=>P(i,times:["17:30","18:00"])).ToArray(),
            [new Slot(12,"17:30"),new Slot(12,"18:00")]),30);
        Check(shared.Matches.Length==1,"A court shared across whole and half-hour starts cannot be double-booked");
        var spouses = new[] {P(1,cr:1) with {SpouseNo=2,SpouseMode=2}, P(2,cr:5),P(3,cr:3),P(4,cr:3)};
        var together = Scheduler.Solve(Data(spouses,oneCourt),30);
        Check(together.Matches.Length==1 && together.Matches.SelectMany(m=>new[]{m.Team1,m.Team2}).Any(t=>t.Contains(1)&&t.Contains(2)), "Spouses must partner despite CR gap");
        Check(together.Score==95, "Spouses' CR difference must not reduce score");
        var repeatSlots = new[] {new Slot(1,"18:00"),new Slot(1,"19:00")};
        var repeatedLocks = new[] {new Match(1,"18:00",[1,2],[3,4]),new Match(1,"19:00",[2,1],[4,3])};
        var repeatPlayers = Enumerable.Range(1,4).Select(i=>P(i,2)).ToArray();
        var repeatsRejected=false;
        try {Scheduler.Solve(Data(repeatPlayers,repeatSlots,locked:repeatedLocks),30);}
        catch(ArgumentException e) when(e.Message.Contains("Ingen gyldig")) {repeatsRejected=true;}
        Check(repeatsRejected,"Repeated partners in locked matches must be rejected");
        repeatPlayers[0]=repeatPlayers[0] with {SpouseNo=2,SpouseMode=2};
        repeatPlayers[2]=repeatPlayers[2] with {SpouseNo=4,SpouseMode=2};
        Check(Scheduler.Solve(Data(repeatPlayers,repeatSlots,locked:repeatedLocks),30).Matches.Length==2,"Spouse teams may repeat");
        Check(new Weights().FactorOpponentThisWeek == 5, "Default weekly opponent penalty is 5");
        var threeSlots = new[] {new Slot(1,"18:00"),new Slot(1,"19:00"),new Slot(1,"20:00")};
        var threeLocks = repeatedLocks.Append(new Match(1,"20:00",[3,4],[1,2])).ToArray();
        var threePlayers = repeatPlayers.Select(p => p with {RequestedHours=3}).ToArray();
        foreach (var factor in new[] {0,5,7,-5}) {
            var repeated = Scheduler.Solve(Data(threePlayers,threeSlots,new Weights(FactorOpponentThisWeek:factor),locked:threeLocks),30);
            Check(repeated.Score == 285 - 8 * factor, "Four opponent pairs repeated twice; teams and spouse exceptions do not change penalty");
        }
        var singleTimes = new[] {"20:30","21:30","22:30"};
        var singlePlayers = new[] {P(1,3,singleTimes),P(2,3,singleTimes)};
        var singleLocks = singleTimes.Select(t=>new Match(1,t,[1],[2])).ToArray();
        Check(Scheduler.Solve(Data(singlePlayers,singleTimes.Select(t=>new Slot(1,t)).ToArray(),locked:singleLocks),30).Score==260,
            "Single opponents repeated three times incur two penalties");
        var diverse = Scheduler.Solve(Data(Enumerable.Range(1,8).Select(i=>P(i,2)).ToArray(),
            [new Slot(1,"18:00"),new Slot(2,"18:00"),new Slot(1,"19:00"),new Slot(2,"19:00")]),30);
        Check(diverse.Matches.Length==4 && diverse.Score==380,"Optimizer chooses different opponents when all hours can be preserved");
        var simultaneous = Enumerable.Range(1,8).Select(i=>P(i)).ToArray();
        simultaneous[0]=simultaneous[0] with {SpouseNo=2,SpouseMode=1};
        var separate = Scheduler.Solve(Data(simultaneous,[new Slot(1,"18:00"),new Slot(2,"18:00")],
            locked:[new Match(1,"18:00",[1,3],[4,5]),new Match(2,"18:00",[2,6],[7,8])]),30);
        Check(separate.Matches.Length==2, "Simultaneous spouses may play on separate courts");
        var unequal = Scheduler.Solve(Data([P(1,2) with {SpouseNo=2,SpouseMode=1},P(2),P(3,2),P(4,2)],
            [new Slot(1,"18:00"),new Slot(1,"19:00")]),30);
        Check(Count(unequal,1)==1 && Count(unequal,2)==1,"All spouse hours must coincide even with unequal requests");
        var absent = Scheduler.Solve(Data([P(1) with {SpouseNo=99,SpouseMode=2},P(2),P(3),P(4)],oneCourt),30);
        Check(Count(absent,1)==1,"Absent spouse must not prevent play");
        var conflictRejected=false;
        try { Scheduler.Solve(Data(spouses,oneCourt,locked:[new Match(1,"18:00",[1,3],[2,4])]),30); }
        catch(ArgumentException e) when(e.Message.Contains("Ingen gyldig")) {conflictRejected=true;}
        Check(conflictRejected,"Locked matches cannot override spouse partnership");
        foreach (var (times, expected) in new[] {
            (new[] { "18:00", "19:30" }, 2),
            (new[] { "18:00", "20:00" }, 1),
            (new[] { "18:00", "19:30", "21:00" }, 3)
        }) {
            var rest = Scheduler.Solve(Data(Enumerable.Range(1, 4).Select(i => P(i, 3, times)).ToArray(),
                times.Select((time, i) => new Slot(i + 1, time)).ToArray()), 30);
            Check(Enumerable.Range(1, 4).All(id => Count(rest, id) == expected), "Maximum 30-minute rest, including across courts and three matches");
        }
        var lockedRestRejected = false;
        try {
            Scheduler.Solve(Data(Enumerable.Range(1,4).Select(i => P(i,2,["18:00","20:00"])).ToArray(),
                [new Slot(1,"18:00"),new Slot(1,"20:00")],
                locked: [new Match(1,"18:00",[1,2],[3,4]),new Match(1,"20:00",[1,2],[3,4])]),30);
        } catch (ArgumentException e) when (e.Message.Contains("Ingen gyldig")) { lockedRestRejected = true; }
        Check(lockedRestRejected, "Locked matches must not override the maximum rest");
        var slots = new[] { new Slot(1, "18:00"), new Slot(5, "18:30"), new Slot(1, "19:00"), new Slot(1, "20:00") };
        var priorities = Scheduler.Solve(Data(Enumerable.Range(1, 4).Select(i => P(i, 3)).ToArray(), slots), 30);
        Check(Enumerable.Range(1, 4).All(id => Count(priorities, id) == 3), "Must fulfil three hours without half-hour overlap");
        Check(priorities.Matches.All(m => m.StartTime != "18:30"), "18:30 cannot overlap 18:00 or 19:00");
        var partnerKeys=priorities.Matches.SelectMany(m=>new[]{m.Team1,m.Team2}).Where(t=>t.Length==2).Select(t=>string.Join(":",t.Order())).ToArray();
        Check(partnerKeys.Distinct().Count()==partnerKeys.Length,"Three hours must use different partners even with zero partner penalties");
        var queue = Scheduler.Solve(Data(Enumerable.Range(1, 6).Select(i => P(i)).ToArray(), oneCourt), 30);
        Check(Enumerable.Range(1, 4).All(id => Count(queue, id) == 1) && Count(queue, 5) == 0 && Count(queue, 6) == 0, "Earlier signup wins shortage");
        var waiting = Scheduler.Solve(Data(new[] {P(10), P(11), P(12), P(13), P(1, status:"waitlist"), P(2, status:"waitlist")}, oneCourt), 30);
        Check(Count(waiting, 1) == 0 && Count(waiting, 2) == 0, "Waitlist cannot displace active signups");
        var shortage = Scheduler.Solve(Data(Enumerable.Range(1,6).Select(i=>P(i,2)).ToArray(), [new Slot(1,"18:00"),new Slot(1,"19:00")]),30);
        Check(Enumerable.Range(1,6).All(id=>Count(shortage,id)>=1) && Enumerable.Range(1,6).Count(id=>Count(shortage,id)==2)==2, "Everyone's first hour precedes second hours");
        var activeSecond = Scheduler.Solve(Data(new[] {P(10,2),P(11,2),P(12,2),P(13,2),P(1,status:"waitlist"),P(2,status:"waitlist")}, [new Slot(1,"18:00"),new Slot(1,"19:00")]),30);
        Check(Enumerable.Range(10,4).All(id=>Count(activeSecond,id)==2) && Count(activeSecond,1)==0 && Count(activeSecond,2)==0, "Active second hours precede any waitlist hours");
        var negativeScore = Scheduler.Solve(Data(new[] {P(1,cr:1),P(2,cr:1),P(3,cr:1),P(4,cr:4)},oneCourt,new Weights(FactorDistanceSameTeamA:3)),30);
        Check(Enumerable.Range(1,4).All(id=>Count(negativeScore,id)==1) && negativeScore.Score<0, "Negative match score must not sacrifice first-hour coverage");
        var mixedSingle = Scheduler.Solve(Data([
            P(1,2,["20:00","21:00"],gender:"K",cr:3), P(2,1,["21:00"],cr:3),
            P(3,1,["20:00"],gender:"K",cr:3), P(4,1,["20:00"],cr:3), P(5,1,["20:00"],cr:3)
        ], [new Slot(1,"20:00"),new Slot(1,"21:00")], new Weights(FactorSingle:250)),30);
        Check(Enumerable.Range(1,5).All(id=>Count(mixedSingle,id)>=1) && Count(mixedSingle,1)==2,
            "Mixed single at 21:00 must fulfil first and second hours despite its negative score");
        Check(mixedSingle.Matches.Single(m=>m.StartTime=="21:00").Team1.Concat(mixedSingle.Matches.Single(m=>m.StartTime=="21:00").Team2).Order().SequenceEqual(new[]{1,2}),
            "Late mixed single must use the two available players");
        Check(mixedSingle.Score == -50, "Mixed double 100 plus mixed single -150 at FactorSingle=250");
        var lateTimes = new[] {"20:30","21:30"};
        var lateCourts = new[] {new Slot(1,"20:30"),new Slot(2,"20:30")};
        var gap = Scheduler.Solve(Data(new[] {P(1, times:lateTimes,cr:1), P(2,times:lateTimes,cr:1), P(3,times:lateTimes,cr:5), P(4,times:lateTimes,cr:5)}, lateCourts), 30);
        Check(gap.Matches.Length==2 && gap.Matches.All(m => m.Team1.Length == 1), "CR gap >3 must prohibit doubles");
        var boundary = Scheduler.Solve(Data(new[] {P(1, cr:1), P(2, cr:1), P(3, cr:4), P(4, cr:4)}, oneCourt), 30);
        Check(boundary.Matches.Single().Team1.Length == 2, "CR gap =3 must be allowed");
        var bannedInput = Data(new[] {P(1, member:"club-a"), P(2, member:"club-b"), P(3), P(4)}, oneCourt);
        var banned = Scheduler.Solve(bannedInput with { ForbiddenMemberPairs = [["club-b", "club-a"]] }, 30);
        Check(!banned.Matches.Any(m => m.Team1.Concat(m.Team2).Contains(1) && m.Team1.Concat(m.Team2).Contains(2)), "Forbidden member pair");
        Check(Scheduler.Solve(bannedInput, 30).Matches.Length == 1, "Removing pair permits match again");
        var unavailable = Scheduler.Solve(Data(new[] {P(1, times:["19:00"]), P(2), P(3), P(4)}, oneCourt), 30);
        Check(Count(unavailable, 1) == 0, "Must never use unavailable time");
        var mixed = Scheduler.Solve(Data(new[] {P(1, gender:"K"), P(2, gender:"K"), P(3), P(4)}, oneCourt), 30);
        Check(mixed.Score == 100 && mixed.Matches.Single().Team1.Count(id => id <= 2) == 1, "Mixed must split genders between teams");
        var history = new[] {new Round("2026-09-18", [new HistoryMatch([1,2], [3,4])])};
        var lockMatch = new Match(1, "18:00", [1,2], [3,4]);
        var historical = Scheduler.Solve(Data(Enumerable.Range(1,4).Select(i=>P(i)).ToArray(), oneCourt, history:history, locked:[lockMatch]), 30);
        Check(historical.Score == 15, "Two repeated partners get both penalties, four repeated opponent pairs: 100-40-20-20-5");
        var aged = Scheduler.Solve(Data(new[] {P(1, age:20), P(2, age:40), P(3, age:50), P(4, age:70)}, oneCourt, new Weights(FactorAge:1), locked:[lockMatch]), 30);
        var partlyAged = Scheduler.Solve(Data(new[] {P(1, age:null), P(2, age:40), P(3, age:50), P(4, age:70)}, oneCourt, new Weights(FactorAge:1), locked:[lockMatch]), 30);
        Check(partlyAged.Score == 75, "Unknown age is omitted: only known partner ages contribute 20");
        var unknownAged = Scheduler.Solve(Data(Enumerable.Range(1,4).Select(i=>P(i,age:null)).ToArray(), oneCourt, new Weights(FactorAge:1), locked:[lockMatch]), 30);
        Check(unknownAged.Score == 95, "All unknown ages contribute no penalty");
        var variedCr = new[] {P(1,cr:2), P(2,cr:5), P(3,cr:3), P(4,cr:4)};
        var sameTeam = Scheduler.Solve(Data(variedCr, oneCourt, new Weights(FactorDistanceSameTeamA:3), locked:[lockMatch]),30);
        Check(sameTeam.Score == 35, "Both team differences: 100-5-15*(3+1)=35");
        var noSameTeam = Scheduler.Solve(Data(variedCr, oneCourt, new Weights(FactorSameTeamDifference:0,FactorDistanceSameTeamA:3), locked:[lockMatch]),30);
        Check(noSameTeam.Score == 95, "Zero factor disables same-team difference");
        var preferSimilar = Scheduler.Solve(Data(variedCr, oneCourt, new Weights(FactorMatchDifference:0)),30);
        Check(preferSimilar.Score == 65, "Solver prefers similar partners: 100-5-15*(1+1)=65");
        Check(aged.Score == -5, "Age: 20+20+abs(60-120)=100, score 100-5-100");
        var early = Scheduler.Solve(Data(new[] {P(1,times:lateTimes), P(2,times:lateTimes)}, [new Slot(1,"20:30"), new Slot(1,"21:30")]), 30);
        Check(early.Matches.Single().StartTime == "20:30", "Earliest of equal-score plans");
        Check(early.Status == "OPTIMAL", "Tiny model must prove all stages optimal");
        var moreMatches = Scheduler.Solve(Data(Enumerable.Range(1,4).Select(i=>P(i,times:lateTimes)).ToArray(), lateCourts,new Weights(FactorSingle:250)),30);
        Check(moreMatches.Matches.Length == 2 && moreMatches.Score == -300, "More matches precede score once hour wishes are equal");
        var noEarlySingle = Scheduler.Solve(Data([P(1,times:["20:00","20:30"]),P(2,times:["20:00","20:30"])],
            [new Slot(1,"20:00"),new Slot(2,"20:30")]),30);
        Check(noEarlySingle.Matches.Single().StartTime=="20:30", "Singles must never start before 20:30");
        var distancePlayers = new[] {P(1,cr:4),P(2,cr:4),P(3,cr:7),P(4,cr:7)};
        Check(new Weights().FactorDistanceSameTeamA == 2, "Default partner distance is 2");
        var integerDistance = Scheduler.Solve(Data(distancePlayers,oneCourt,new Weights(FactorDistanceSameTeamA:4)),30);
        Check(integerDistance.Matches.Length == 1, "Partner distance accepts integers other than 2 and 3");
        var distance = Scheduler.Solve(Data(distancePlayers,oneCourt,new Weights(FactorDistanceSameTeamA:2)),30);
        Check(distance.Matches.Length==1 && distance.Matches.SelectMany(m=>new[]{m.Team1,m.Team2}).All(team=>
            Math.Abs(distancePlayers.Single(p=>p.Id==team[0]).Cr-distancePlayers.Single(p=>p.Id==team[1]).Cr)<=2), "CR4 cannot partner CR7 when distance is 2");
        var lowerRanked = Scheduler.Solve(Data([P(1,cr:5),P(2,cr:8),P(3,cr:5),P(4,cr:8)],oneCourt,
            new Weights(FactorDistanceSameTeamA:2),locked:[lockMatch]),30);
        Check(lowerRanked.Matches.Length==1, "DistanceSameTeamA does not restrict partners when both CR values exceed 4");
        Console.WriteLine("PASS: hours, overlaps, queue, waitlist, CR limits, forbidden pairs, availability, mix, history, age, early times and optimality.");
    }
}
