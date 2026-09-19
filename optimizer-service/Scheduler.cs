using Google.OrTools.Sat;
using System.Diagnostics;

namespace HIkOptimizer;

public record Player(int Id, string MemberNo, int Cr, string Gender, int? Age, string[] Availability, int RequestedHours, int SignupOrder, string Status, long? SpouseNo = null, int? SpouseMode = null);
public record Slot(int Court, string StartTime);
public record Match(int Court, string StartTime, int[] Team1, int[] Team2);
public record HistoryMatch(int[] Team1, int[] Team2);
public record Round(string Date, HistoryMatch[] Matches);
public record Weights(int FactorMatchDifference = 40, int FactorSameTeamLastWeek = 20, int FactorSameTeam3Weeks = 10, int FactorOpponentLastWeek = 5, int FactorMix = 10, int FactorAge = 0, int FactorSameTeamDifference = 15, int FactorDistanceSameTeamA = 3);
public record Input(Player[] Players, Slot[] Slots, Round[] History, Match[] Locked, Weights Weights);
public record Stage(string Name, long Value, string Status);
public record Result(Match[] Matches, string Status, Stage[] Stages, long Score, double Seconds);

public static class Scheduler
{
    static int Minutes(string time) => TimeOnly.ParseExact(time, "HH:mm").Hour * 60 + TimeOnly.ParseExact(time, "HH:mm").Minute;
    static string Pair(int a, int b) => a < b ? $"{a}:{b}" : $"{b}:{a}";
    static bool PointsTo(Player a, Player b) => a.SpouseNo is not null && long.TryParse(b.MemberNo, out var number) && a.SpouseNo == number;
    static bool Together(Player a, Player b) => a.SpouseMode == 2 && PointsTo(a,b) || b.SpouseMode == 2 && PointsTo(b,a);
    static bool Forbidden(Player a, Player b) => !Together(a,b) && Math.Abs(a.Cr - b.Cr) > 3 ||
        new[] { ("17108", "13993"), ("17108", "16212"), ("11822", "15722") }
            .Any(pair => a.MemberNo == pair.Item1 && b.MemberNo == pair.Item2 || a.MemberNo == pair.Item2 && b.MemberNo == pair.Item1);

    static void SetHint(CpModel model, CpSolver solver)
    {
        model.ClearHints();
        model.Model.SolutionHint = new PartialVariableAssignment();
        var solution = solver.Response?.Solution ?? throw new InvalidOperationException("CP-SAT returned no assignment.");
        model.Model.SolutionHint.Vars.AddRange(Enumerable.Range(0, solution.Count));
        model.Model.SolutionHint.Values.AddRange(solution);
    }

    public static Result Solve(Input input, double seconds = 600, CancellationToken cancellation = default)
    {
        if (input.Players is null || input.Slots is null || input.History is null || input.Locked is null || input.Weights is null)
            throw new ArgumentException("Ufuldstændige beregningsdata.");
        var players = input.Players;
        if (players.Length > 200 || input.Slots.Length > 32 || input.History.Length > 3 || players.Select(p => p.Id).Distinct().Count() != players.Length)
            throw new ArgumentException("Ugyldigt antal spillere, banetider eller historikrunder.");
        var w = input.Weights;
        if (w.FactorDistanceSameTeamA is not (2 or 3)) throw new ArgumentException("FactorDistanceSameTeamA skal være 2 eller 3.");
        if (new[] {w.FactorMatchDifference, w.FactorSameTeamDifference, w.FactorSameTeamLastWeek, w.FactorSameTeam3Weeks, w.FactorOpponentLastWeek, w.FactorMix, w.FactorAge}.Any(v => Math.Abs((long)v) > 1_000_000))
            throw new ArgumentException("Ugyldige vægte.");
        foreach (var p in players)
            if (p.Cr is < 1 or > 9 || p.RequestedHours is < 1 or > 3 || p.SignupOrder < 1 || p.Gender is not ("M" or "K") || p.Status is not ("active" or "waitlist") || p.Availability is null || w.FactorAge != 0 && (p.Age is null or < 0 or > 120))
                throw new ArgumentException("En spiller mangler gyldige tilmeldings-, CR-, køns- eller aldersoplysninger.");

        var timer = Stopwatch.StartNew();
        foreach (var p in players) {
            if ((p.SpouseNo is not null || p.SpouseMode is not null) &&
                (p.SpouseNo is null or <= 0 || p.SpouseMode is not (1 or 2) || PointsTo(p,p)))
                throw new ArgumentException("Ugyldig partnerbetingelse.");
            if (players.Count(q => PointsTo(p,q)) > 1) throw new ArgumentException("Partnerens medlemsnummer er ikke entydigt.");
        }
        var model = new CpModel();
        var slots = input.Slots.OrderBy(s => s.StartTime).ThenBy(s => s.Court).ToArray();
        var byId = players.Select((p, i) => (p.Id, i)).ToDictionary(x => x.Id, x => x.i);
        var x = new BoolVar[players.Length, slots.Length, 2];
        var present = new BoolVar[players.Length, slots.Length];
        var used = new BoolVar[slots.Length];
        var doubles = new BoolVar[slots.Length];
        var score = LinearExpr.NewBuilder();
        var recentPartners = new HashSet<string>();
        var lastPartners = new HashSet<string>();
        var lastOpponents = new HashSet<string>();
        for (int r = 0; r < input.History.Length; r++)
            foreach (var match in input.History[r].Matches)
            {
                foreach (var team in new[] { match.Team1, match.Team2 })
                    if (team.Length == 2) { recentPartners.Add(Pair(team[0], team[1])); if (r == 0) lastPartners.Add(Pair(team[0], team[1])); }
                if (r == 0) foreach (int a in match.Team1) foreach (int b in match.Team2) lastOpponents.Add(Pair(a, b));
            }

        BoolVar Both(BoolVar a, BoolVar b, string name)
        {
            var v = model.NewBoolVar(name);
            model.Add(v <= a); model.Add(v <= b); model.Add(v >= a + b - 1);
            return v;
        }
        for (int s = 0; s < slots.Length; s++)
        {
            used[s] = model.NewBoolVar($"used{s}"); doubles[s] = model.NewBoolVar($"double{s}");
            model.Add(doubles[s] <= used[s]);
            if (Minutes(slots[s].StartTime) < Minutes("20:30")) model.Add(doubles[s] == used[s]);
            for (int p = 0; p < players.Length; p++)
            {
                present[p, s] = model.NewBoolVar($"p{p}s{s}");
                for (int t = 0; t < 2; t++) x[p, s, t] = model.NewBoolVar($"p{p}s{s}t{t}");
                model.Add(present[p, s] == x[p, s, 0] + x[p, s, 1]);
                if (!players[p].Availability.Contains(slots[s].StartTime)) model.Add(present[p, s] == 0);
            }
            LinearExpr TeamSum(int team, Func<Player, int> value) => LinearExpr.WeightedSum(
                Enumerable.Range(0, players.Length).Select(p => x[p, s, team]), players.Select(value));
            for (int t = 0; t < 2; t++) model.Add(TeamSum(t, _ => 1) == used[s] + doubles[s]);
            var balance = model.NewIntVar(0, 18, $"balance{s}");
            model.AddAbsEquality(balance, TeamSum(0, p => p.Cr) - TeamSum(1, p => p.Cr));
            var women = model.NewIntVar(0, 4, $"women{s}");
            model.Add(women == TeamSum(0, p => p.Gender == "K" ? 1 : 0) + TeamSum(1, p => p.Gender == "K" ? 1 : 0));
            var mix = model.NewIntVar(0, 5, $"mix{s}");
            model.AddAllowedAssignments(new IntVar[] { used[s], doubles[s], women, mix }).AddTuples(new long[,] {
                {0,0,0,0}, {1,0,0,5}, {1,0,1,5}, {1,0,2,5}, {1,1,0,1}, {1,1,1,2}, {1,1,2,0}, {1,1,3,2}, {1,1,4,1}
            });
            var twoWomen = model.NewBoolVar($"twoWomen{s}");
            model.Add(women == 2).OnlyEnforceIf(twoWomen); model.Add(women != 2).OnlyEnforceIf(twoWomen.Not());
            model.Add(TeamSum(0, p => p.Gender == "K" ? 1 : 0) == 1).OnlyEnforceIf(new ILiteral[] { doubles[s], twoWomen });
            score.AddTerm(used[s], 100).AddTerm(balance, -w.FactorMatchDifference).AddTerm(mix, -w.FactorMix);
            // Swapping teams cannot change the score. Avoid searching both labels,
            // except where a locked match explicitly fixes them.
            if (!input.Locked.Any(m => m.Court == slots[s].Court && m.StartTime == slots[s].StartTime))
                model.Add(TeamSum(0, p => byId[p.Id] + 1) <= TeamSum(1, p => byId[p.Id] + 1));
            if (w.FactorAge != 0)
            {
                var ageBalance = model.NewIntVar(0, 240, $"ageBalance{s}");
                model.AddAbsEquality(ageBalance, TeamSum(0, p => p.Age!.Value) - TeamSum(1, p => p.Age!.Value));
                score.AddTerm(ageBalance, -w.FactorAge);
            }
            for (int p = 0; p < players.Length; p++) for (int q = p + 1; q < players.Length; q++)
            {
                if (Forbidden(players[p], players[q])) { model.Add(present[p, s] + present[q, s] <= 1); continue; }
                if (!players[p].Availability.Contains(slots[s].StartTime) || !players[q].Availability.Contains(slots[s].StartTime)) continue;
                if (!Together(players[p],players[q]) && Math.Min(players[p].Cr, players[q].Cr) <= 4 && Math.Abs(players[p].Cr - players[q].Cr) > w.FactorDistanceSameTeamA)
                    for (int t = 0; t < 2; t++) model.Add(x[p, s, t] + x[q, s, t] <= 1);
                var key = Pair(players[p].Id, players[q].Id);
                long partnerPenalty = (lastPartners.Contains(key) ? w.FactorSameTeamLastWeek : 0L)
                    + (Together(players[p],players[q]) ? 0 : (long)w.FactorSameTeamDifference * Math.Abs(players[p].Cr - players[q].Cr))
                    + (recentPartners.Contains(key) ? w.FactorSameTeam3Weeks : 0L)
                    + (w.FactorAge != 0 ? (long)w.FactorAge * Math.Abs(players[p].Age!.Value - players[q].Age!.Value) : 0);
                long opponentPenalty = lastOpponents.Contains(key) ? w.FactorOpponentLastWeek : 0;
                if (partnerPenalty != 0 || opponentPenalty != 0)
                {
                    for (int t = 0; t < 2; t++) score.AddTerm(Both(x[p, s, t], x[q, s, t], $"partners{p}:{q}:{s}:{t}"), opponentPenalty - partnerPenalty);
                    if (opponentPenalty != 0) score.AddTerm(Both(present[p, s], present[q, s], $"opponents{p}:{q}:{s}"), -opponentPenalty);
                }
            }
        }
        for (int p = 0; p < players.Length; p++) for (int q = p + 1; q < players.Length; q++) {
            if (!PointsTo(players[p],players[q]) && !PointsTo(players[q],players[p])) continue;
            if (Together(players[p],players[q])) {
                for (int s = 0; s < slots.Length; s++) for (int t = 0; t < 2; t++)
                    model.Add(x[p,s,t] == x[q,s,t]);
            } else foreach (var time in slots.Select(s => s.StartTime).Distinct()) {
                var indices = Enumerable.Range(0,slots.Length).Where(s => slots[s].StartTime == time).ToArray();
                model.Add(LinearExpr.Sum(indices.Select(s => present[p,s])) == LinearExpr.Sum(indices.Select(s => present[q,s])));
            }
        }
        // A pair may partner only once in this plan, except mandatory spouse teams.
        for (int p = 0; p < players.Length; p++) for (int q = p + 1; q < players.Length; q++) {
            if (Together(players[p],players[q]) || Forbidden(players[p],players[q])) continue;
            var partnerships = new List<BoolVar>();
            for (int s = 0; s < slots.Length; s++) {
                if (!players[p].Availability.Contains(slots[s].StartTime) || !players[q].Availability.Contains(slots[s].StartTime)) continue;
                for (int t = 0; t < 2; t++) partnerships.Add(Both(x[p,s,t],x[q,s,t],$"uniquePartners{p}:{q}:{s}:{t}"));
            }
            model.Add(LinearExpr.Sum(partnerships) <= 1);
        }
        var hours = new IntVar[players.Length];
        var reached = new BoolVar[players.Length, 3];
        for (int p = 0; p < players.Length; p++)
        {
            hours[p] = model.NewIntVar(0, players[p].RequestedHours, $"hours{p}");
            model.Add(hours[p] == LinearExpr.Sum(Enumerable.Range(0, slots.Length).Select(s => present[p, s])));
            // Every 30-minute boundary is a clique of mutually overlapping one-hour matches.
            foreach (var time in slots.Select(s => Minutes(s.StartTime)).Distinct())
                model.Add(LinearExpr.Sum(Enumerable.Range(0, slots.Length).Where(s => Minutes(slots[s].StartTime) <= time && Minutes(slots[s].StartTime) + 60 > time).Select(s => present[p, s])) <= 1);
            // Distant selected matches require another selected match between them.
            // This bounds consecutive starts to 90 minutes (60 play + 30 rest).
            for (int a = 0; a < slots.Length; a++) for (int b = a + 1; b < slots.Length; b++)
                if (Minutes(slots[b].StartTime) - Minutes(slots[a].StartTime) > 90)
                    model.Add(present[p, a] + present[p, b] <= 1 + LinearExpr.Sum(
                        Enumerable.Range(0, slots.Length).Where(s =>
                            Minutes(slots[s].StartTime) > Minutes(slots[a].StartTime) &&
                            Minutes(slots[s].StartTime) < Minutes(slots[b].StartTime)).Select(s => present[p, s])));
            for (int h = 0; h < 3; h++)
            {
                reached[p, h] = model.NewBoolVar($"reached{p}:{h}");
                model.Add(hours[p] >= h + 1).OnlyEnforceIf(reached[p, h]);
                model.Add(hours[p] <= h).OnlyEnforceIf(reached[p, h].Not());
            }
        }
        for (int s = 0; s < slots.Length; s++) for (int other = s + 1; other < slots.Length; other++)
            if (slots[s].Court == slots[other].Court && Math.Abs(Minutes(slots[s].StartTime) - Minutes(slots[other].StartTime)) < 60)
                model.Add(used[s] + used[other] <= 1);
        foreach (var locked in input.Locked)
        {
            int s = Array.FindIndex(slots, slot => slot.Court == locked.Court && slot.StartTime == locked.StartTime);
            if (s < 0 || locked.Team1.Length != locked.Team2.Length || locked.Team1.Length is not (1 or 2)) throw new ArgumentException("Ugyldig låst kamp.");
            for (int t = 0; t < 2; t++) foreach (int id in t == 0 ? locked.Team1 : locked.Team2)
            {
                if (!byId.TryGetValue(id, out int p)) throw new ArgumentException("En låst kamp har en spiller uden tilmelding.");
                model.Add(x[p, s, t] == 1);
            }
            model.Add(doubles[s] == (locked.Team1.Length == 2 ? 1 : 0));
        }

        // Successive objectives preserve earlier results without freezing the actual assignments.
        var objectives = new List<(string name, LinearExpr value)>();
        foreach (string status in new[] { "active", "waitlist" })
        {
            var ordered = Enumerable.Range(0, players.Length).Where(p => players[p].Status == status).OrderBy(p => players[p].SignupOrder).ThenBy(p => players[p].Id).ToArray();
            if (ordered.Length == 0) continue;
            // A first hour outweighs ALL second/third hours. Search the whole vector
            // together instead of freezing an unproven first-hour count after 8 seconds.
            long radix = ordered.Length + 1;
            var coverage = LinearExpr.NewBuilder();
            for (int h = 0; h < 3; h++)
                coverage.AddTerm(LinearExpr.Sum(ordered.Select(p => reached[p, h])), h == 0 ? radix * radix : h == 1 ? radix : 1);
            objectives.Add(($"{status}:hours", coverage));
            objectives.Add(($"{status}:signupOrder", LinearExpr.WeightedSum(ordered.Select(p => hours[p]), Enumerable.Range(0, ordered.Length).Select(i => ordered.Length - i))));
        }
        objectives.Add(("matches", LinearExpr.Sum(used)));
        objectives.Add(("score", score));
        // One early-time objective avoids repeating presolve seven times. Each earlier
        // player-hour outweighs all later ones. Limit the exponent for int64 safety.
        var startTimes = slots.Select(s => s.StartTime).Distinct().ToArray();
        LinearExpr AtTime(string time) => LinearExpr.Sum(Enumerable.Range(0, slots.Length)
            .Where(s => slots[s].StartTime == time).SelectMany(s => Enumerable.Range(0, players.Length).Select(p => present[p, s])));
        if (startTimes.Length <= 7)
        {
            long radix = slots.Length * 4 + 1, weight = 1;
            var early = LinearExpr.NewBuilder();
            foreach (var time in startTimes.Reverse()) { early.AddTerm(AtTime(time), weight); weight *= radix; }
            objectives.Add(("early:all", early));
        }
        else foreach (var time in startTimes) objectives.Add(($"early:{time}", AtTime(time)));
        var validation = model.Validate();
        if (validation.Length > 0) throw new ArgumentException($"Ugyldig CP-SAT-model: {validation}");
        var stages = new List<Stage>();
        Match[]? best = null;
        long bestScore = 0;
        CpSolver? incumbent = null;
        foreach (var objective in objectives)
        {
            cancellation.ThrowIfCancellationRequested();
            double remaining = seconds - timer.Elapsed.TotalSeconds;
            if (remaining < 0.1) break;
            model.Maximize(objective.value);
            double stageSeconds = objective.name == "score" ? 40 : objective.name.EndsWith(":hours") ? 20 : objective.name == "early:all" ? 10 : objective.name.StartsWith("early:") ? 2 : 5;
            stageSeconds *= Math.Max(1, seconds / 100);
            var stageEnd = Math.Min(seconds, timer.Elapsed.TotalSeconds + stageSeconds);
            CpSolver? solver = incumbent;
            var status = CpSolverStatus.Unknown;
            // Independent seeds explore different paths within the shared time budget.
            // A complete hint and a lower bound protect the best solution on restart.
            int attempts = objective.name.StartsWith("early:") ? 1 : 2;
            for (int attempt = 0; attempt < attempts; attempt++)
            {
                cancellation.ThrowIfCancellationRequested();
                double budget = (stageEnd - timer.Elapsed.TotalSeconds) / (attempts - attempt);
                if (budget < 0.1) break;
                var candidate = new CpSolver { StringParameters = $"max_time_in_seconds:{budget.ToString(System.Globalization.CultureInfo.InvariantCulture)} num_search_workers:4 random_seed:{Random.Shared.Next(1, 1_000_000)} randomize_search:true" };
                using var registration = cancellation.Register(candidate.StopSearch);
                var candidateStatus = candidate.Solve(model);
                if (candidateStatus is CpSolverStatus.Optimal or CpSolverStatus.Feasible)
                {
                    if (solver is null || candidate.Value(objective.value) >= solver.Value(objective.value)) solver = candidate;
                    status = candidateStatus;
                    model.Add(objective.value >= solver.Value(objective.value));
                    SetHint(model, solver);
                    if (status == CpSolverStatus.Optimal) break;
                }
                else if (candidateStatus != CpSolverStatus.Unknown)
                    throw new ArgumentException(candidateStatus == CpSolverStatus.Infeasible ? "Ingen gyldig løsning. Kontrollér låste kampe." : "Ugyldig CP-SAT-model.");
            }
            if (status is not (CpSolverStatus.Optimal or CpSolverStatus.Feasible))
            {
                if (best is null) throw new ArgumentException(status == CpSolverStatus.Infeasible ? "Ingen gyldig løsning. Kontrollér låste kampe." : "Ingen løsning fundet inden tidsgrænsen. Prøv igen.");
                if (status != CpSolverStatus.Unknown) throw new ArgumentException("CP-SAT kunne ikke fortsætte med den fundne løsning.");
                // A previously validated complete assignment is still feasible for this objective.
                // Keep it when search spends its budget on presolve, then try subsequent tie-breaks.
                solver = incumbent!;
                status = CpSolverStatus.Feasible;
            }
            long value = solver!.Value(objective.value);
            stages.Add(new Stage(objective.name, value, status.ToString().ToUpperInvariant()));
            bestScore = solver.Value(score);
            best = Enumerable.Range(0, slots.Length).Where(s => solver.BooleanValue(used[s])).Select(s => new Match(slots[s].Court, slots[s].StartTime,
                Enumerable.Range(0, players.Length).Where(p => solver.BooleanValue(x[p, s, 0])).Select(p => players[p].Id).ToArray(),
                Enumerable.Range(0, players.Length).Where(p => solver.BooleanValue(x[p, s, 1])).Select(p => players[p].Id).ToArray())).ToArray();
            // Later stages may improve an unproven earlier result, but never lower it.
            model.Add(objective.value >= value);
            incumbent = solver;
            SetHint(model, solver);
        }
        if (best is null) throw new ArgumentException("Ingen løsning fundet inden tidsgrænsen.");
        return new Result(best, stages.Count == objectives.Count && stages.All(s => s.Status == "OPTIMAL") ? "OPTIMAL" : "FEASIBLE", stages.ToArray(), bestScore, timer.Elapsed.TotalSeconds);
    }
}
