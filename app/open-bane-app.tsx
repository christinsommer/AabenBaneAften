"use client";
import * as XLSX from "xlsx";
import { unusedImportedCourts } from "../lib/unused-courts";
import rulesContent from "../lib/rules-content.json";
import { ImportedPlanTable } from "./imported-plan";
import { isPlayersImportedMatch } from "../lib/kampplan-filter";
import { useEffect, useState } from "react";
import { InstallApp } from "../components/install-app";
import { SELF_LEVELS, levelScore } from '../lib/ranking';
import { parseWorkbookKampplanRows } from "../lib/kampplan-import";
import {
  CalendarDays,
  Check,
  Clock3,
  Download,
  Lock,
  LogOut,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Settings,
  Trash2,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const levels = SELF_LEVELS;
const timeLabel: Record<string, string> = {
  "18:00": "18.00–19.00",
  "18:30": "18.30–19.30",
  "19:00": "19.00–20.00",
  "19:30": "19.30–20.30",
  "20:00": "20.00–21.00",
  "20:30": "20.30–21.30",
  "21:00": "21.00–22.00",
};
const niceDate = (v: string) =>
  new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${v}T12:00:00`));
const fullDate = (v: string) => new Intl.DateTimeFormat("da-DK", {weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(`${v}T12:00:00`));
const deadlineLabel = (v: string) => new Intl.DateTimeFormat("da-DK", {timeZone:"Europe/Copenhagen",weekday:"long",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(v));

const toMinutes = (time: string) => {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
};
const timesOverlap = (first: string, second: string) =>
  toMinutes(first) < toMinutes(second) + 60 &&
  toMinutes(second) < toMinutes(first) + 60;
const possibleReplacements = (items: any[], matches: any[], match: any, userLevel: string) =>
  items.filter((player: any) => {
    const availability = JSON.parse(player.availability);
    const levelFits = Math.abs(levelScore(player.level) - levelScore(userLevel)) <= 1;
    const hasOverlap = matches.some(
      (other: any) =>
        JSON.parse(other.playerIds).includes(player.id) &&
        timesOverlap(other.startTime, match.startTime),
    );
    return availability.includes(match.startTime) && levelFits && !hasOverlap;
  });

type AuthMode = "login" | "register" | "forgot" | "reset";

export default function OpenBaneApp() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<AuthMode>("login");
  const [openProfile, setOpenProfile] = useState(false);
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("reset") ?? "";
    if (token) {
      setMode("reset");
      setResetToken(token);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  async function load() {
    try {
      const r = await fetch("/api/app", { cache: "no-store" }),
        j = await r.json() as { error?: string; warning?: string };
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke indlæse appen");
    }
  }
  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/app", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        j = await r.json() as { error?: string; warning?: string };
      if (!r.ok) throw new Error(j.error);
      if (payload.action === "register") setOpenProfile(true);
      if (payload.action === "logout" || payload.action === "login") setOpenProfile(false);
      await load();
      if (j.warning) setError(j.warning);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt");
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  if (!data)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f6fa]">
        <RefreshCw className="animate-spin text-[#13375e]" />
      </main>
    );
  if (!data.authenticated)
    return (
      <AuthScreen
        mode={mode}
        setMode={setMode}
        act={act}
        busy={busy}
        error={error}
        event={data.event}
        resetToken={resetToken}
      />
    );
  if (!data.event) return <EmptyCalendarDashboard data={data} act={act} busy={busy} error={error} openProfile={openProfile} />;
  return <Dashboard data={data} act={act} busy={busy} error={error} openProfile={openProfile} />;
}

function AuthScreen({ mode, setMode, act, busy, error, event, resetToken }: any) {
  const [notice, setNotice] = useState("");

  async function handleForgotSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const memberNo = String(form.get("memberNo") ?? "").trim();
    if (!memberNo) return;
    const ok = await act({ action: "request_pin_reset", memberNo });
    if (ok) {
      setNotice("Et reset-link er sendt til den e-mail, der er knyttet til medlemsprofilen.");
      setMode("login");
    }
  }

  async function handleResetSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pin = String(form.get("pin") ?? "");
    const confirmPin = String(form.get("confirmPin") ?? "");
    if (pin !== confirmPin) {
      setNotice("De to PIN-koder stemmer ikke overens.");
      return;
    }
    const ok = await act({ action: "reset_pin", token: resetToken, pin, confirmPin });
    if (ok) {
      setMode("login");
      setNotice("Din pinkode er nu ændret. Du kan logge ind med den nye kode.");
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    act(Object.fromEntries(new FormData(e.currentTarget).entries()));
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dfe4ee,transparent_42%),#f7f8fb] px-4 py-8 sm:py-14">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-[#cfe1d7] bg-white shadow-[0_24px_80px_rgba(19,55,94,.18)] md:grid-cols-[.9fr_1.1fr]">
        <section className="relative overflow-hidden bg-[#13375e] p-8 text-white sm:p-12">
          <div className="tennis-court-bg" aria-hidden="true">
            <span className="court-singles court-singles-left" />
            <span className="court-singles court-singles-right" />
            <span className="court-service court-service-top" />
            <span className="court-service court-service-bottom" />
            <span className="court-center-service" />
            <span className="court-net-bg" />
          </div>
          <div className="relative z-10">
            <img
              src="/hik-logo-clean.png"
              alt="HIK – Hellerup Idræts Klub"
              className="hik-logo-image mb-4 h-24 w-auto object-contain"
            />
            <p className="mb-10 flex max-w-sm flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold uppercase tracking-[.08em] text-white/90">
              <span>Glæde</span>
              <span aria-hidden="true">★</span>
              <span>Udvikling</span>
              <span aria-hidden="true">★</span>
              <span>Fællesskab</span>
              <span aria-hidden="true">★</span>
              <span>Vilje</span>
            </p>
            <p className="text-sm font-bold uppercase tracking-[.22em] text-[#d5dbea]">
              Åben Bane
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
              Tætte kampe
              <br />
              Enkel tilmelding
            </h1>
            <p className="mt-5 max-w-sm text-lg leading-7 text-white/80">
              Fredagstennis med niveau, mix og gode kampe i centrum.
            </p>
            <RulesDialog light />
          </div>
        </section>
        <section className="p-6 sm:p-12">
          <div className="mb-7 flex rounded-xl bg-[#edf1f7] p-1">
            <button
              onClick={() => { setMode("login"); setNotice(""); }}
              className={`flex-1 rounded-lg px-4 py-3 font-semibold ${mode === "login" ? "bg-white text-[#13375e] shadow-sm" : "text-slate-500"}`}
            >
              Log ind
            </button>
            <button
              onClick={() => { setMode("register"); setNotice(""); }}
              className={`flex-1 rounded-lg px-4 py-3 font-semibold ${mode === "register" ? "bg-white text-[#13375e] shadow-sm" : "text-slate-500"}`}
            >
              Opret profil
            </button>
          </div>

          {notice && (
            <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
          )}

          {mode === "forgot" && (
            <div>
              <h2 className="text-2xl font-bold">Glemt pinkode</h2>
              <p className="mt-1 text-slate-500">Skriv dit medlemsnummer, så vi sender et link til den e-mail, der er knyttet til din profil.</p>
              <form onSubmit={handleForgotSubmit} className="mt-7 grid gap-4">
                <Field name="memberNo" label="HIK-medlemsnummer" />
                {error && (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
                )}
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setMode("login"); setNotice(""); }}>
                    Tilbage
                  </Button>
                  <Button disabled={busy} className="flex-1 bg-[#13375e] hover:bg-[#0d2947]">
                    {busy ? "Sender…" : "Send reset-link"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {mode === "reset" && (
            <div>
              <h2 className="text-2xl font-bold">Ny pinkode</h2>
              <p className="mt-1 text-slate-500">Vælg en ny personlig kode, og skriv den to gange.</p>
              <form onSubmit={handleResetSubmit} className="mt-7 grid gap-4">
                <input type="hidden" name="token" value={resetToken} />
                <Field name="pin" label="Ny pinkode (4–8 cifre)" type="password" inputMode="numeric" />
                <Field name="confirmPin" label="Gentag ny pinkode" type="password" inputMode="numeric" />
                {error && (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
                )}
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setMode("login"); setNotice(""); }}>
                    Tilbage til login
                  </Button>
                  <Button disabled={busy} className="flex-1 bg-[#13375e] hover:bg-[#0d2947]">
                    {busy ? "Gemmer…" : "Gem ny kode"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {mode !== "forgot" && mode !== "reset" && (
            <div>
              <h2 className="text-2xl font-bold">
                {mode === "login" ? "Velkommen tilbage" : "Opret spillerprofil"}
              </h2>
              <p className="mt-1 text-slate-500">
                Brug dit HIK-medlemsnummer og en personlig kode.
              </p>
              <form onSubmit={submit} className="mt-7 grid gap-4">
                <input type="hidden" name="action" value={mode} />
                {mode === "register" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field name="firstName" label="Fornavn" autoComplete="given-name" maxLength={100} />
                      <Field name="lastName" label="Efternavn" autoComplete="family-name" maxLength={100} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field name="phone" label="Mobilnummer (valgfrit)" required={false} />
                      <Field name="email" label="E-mail" type="email" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <SelectField name="gender" label="Køn" options={["K", "M"]} />
                      <RankingField id="register-level" />
                    </div>
                  </>
                )}
                <Field name="memberNo" label="HIK-medlemsnummer" />
                <Field
                  name="pin"
                  label="Personlig kode (4–8 cifre)"
                  type="password"
                  inputMode="numeric"
                />
                {error && (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </p>
                )}
                {mode === "login" && (
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-[#13375e] underline underline-offset-2"
                    onClick={() => { setMode("forgot"); setNotice(""); }}
                  >
                    Glemt pinkode?
                  </button>
                )}
                <Button
                  disabled={busy}
                  className="mt-2 h-12 bg-[#13375e] text-base hover:bg-[#0d2947]"
                >
                  {busy ? "Vent…" : mode === "login" ? "Log ind" : "Opret profil"}
                </Button>
              </form>
            </div>
          )}
        </section>
      </div>
      <Disclaimer />
    </main>
  );
}

function Disclaimer() {
  return (
    <footer className="mx-auto mt-6 max-w-5xl px-2 text-center text-sm leading-6 text-slate-500">
      Dette er ikke en officiel HIK-app. Appen er lavet af administratoren for
      Åben Bane Aften. Kommentarer bedes sendt til{" "}
      <a
        className="font-semibold text-[#13375e] underline underline-offset-2"
        href="mailto:aabenbaneaften@hik.dk"
      >
        aabenbaneaften@hik.dk
      </a>
      .
    </footer>
  );
}

function RulesDialog({ light = false }: { light?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={
            light
              ? "mt-7 border-white/50 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              : "border-[#aebbd0] text-[#13375e]"
          }
        >
          Forklaring og regler
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-[#13375e]">
            Forklaring og regler
          </DialogTitle>
          <DialogDescription>
            Sådan fungerer tilmelding og kampfordeling til Åben Bane Aften.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm leading-6 text-slate-700">
          {rulesContent.map(section => <section key={section.title}>
            <h3 className="font-bold text-slate-950">{section.title}</h3>
            {section.paragraphs.map((paragraph, index) => <p key={index} className="mt-2 whitespace-pre-line">{paragraph}</p>)}
          </section>)}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button className="bg-[#13375e]">Luk reglerne</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WaitlistDialog({ items, matches, userMatches, userLevel }: any) {
  const possibleFor = (match: any) =>
    possibleReplacements(items, matches, match, userLevel);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="mt-7 border-white/50 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        >
          <Users className="mr-2 h-4 w-4" />
          Se venteliste ({items.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-[#13375e]">
            Venteliste
          </DialogTitle>
          <DialogDescription>
            Kontakt helst en spiller på samme niveau, hvis du har brug for en
            afløser.
          </DialogDescription>
        </DialogHeader>
        {!items.length ? (
          <p className="rounded-xl bg-slate-50 p-5 text-center text-slate-600">
            Der er ingen på ventelisten endnu.
          </p>
        ) : (
          <div className="space-y-5">
            {userMatches.map((match: any) => {
              const candidates = possibleFor(match);
              return (
                <section
                  key={match.id}
                  className="rounded-2xl border border-[#a9c9b6] bg-[#f0f3f8] p-4"
                >
                  <h3 className="font-bold text-[#13375e]">
                    Mulige afløsere til kl. {timeLabel[match.startTime]} · bane{" "}
                    {match.court}
                  </h3>
                  {!candidates.length ? (
                    <p className="mt-2 text-sm text-slate-600">
                      Ingen på ventelisten passer til både tiden og dit niveau.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {candidates.map((player: any) => (
                        <WaitlistPlayer key={player.id} player={player} compact />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            <section>
              <h3 className="mb-2 font-bold text-slate-950">
                Hele ventelisten
              </h3>
              <div className="space-y-2">
                {items.map((player: any) => (
                  <WaitlistPlayer key={player.id} player={player} />
                ))}
              </div>
            </section>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button className="bg-[#13375e]">Luk ventelisten</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WaitlistPlayer({ player, compact = false }: any) {
  const availability = JSON.parse(player.availability).map(
    (time: string) => timeLabel[time],
  );
  return (
              <div
                className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-[#e8edf5] text-[#13375e]">
                      {player.level}
                    </Badge>
                    <span className="font-semibold">{player.name}</span>
                  </div>
                  {!compact && (
                    <p className="mt-2 text-sm text-slate-500">
                      Kan spille: {availability.join(", ")}
                    </p>
                  )}
                </div>
                <a
                  href={`mailto:${player.email}`}
                  className="inline-flex items-center gap-2 break-all font-semibold text-[#13375e] underline underline-offset-2"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  {player.email}
                </a>
              </div>
  );
}

function Dashboard({ data, act, busy, error, openProfile }: any) {
  const userMatches = data.matches.filter((m: any) =>
    JSON.parse(m.playerIds).includes(data.user.id),
  );
  const now = new Date();
  const reminderStart = new Date(`${data.event.date}T16:00:00`);
  const reminderEnd = new Date(`${data.event.date}T23:00:00`);
  const showReminder =
    userMatches.length > 0 && now >= reminderStart && now <= reminderEnd;
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <header className="sticky top-0 z-20 border-b border-[#dce9e1] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img
              src="/hik-logo-clean.png"
              alt="HIK"
              className="hik-logo-image h-11 w-11 rounded-md object-cover"
            />
            <div>
              <p className="font-bold leading-tight">Åben Bane</p>
              <p className="text-xs text-slate-500">
                {niceDate(data.event.date)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium sm:block">
              {data.user.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => act({ action: "logout" })}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-9">
        {error && (
          <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </p>
        )}
        {showReminder && (
          <p className="mb-5 rounded-xl border border-[#aebbd0] bg-white p-4 font-semibold text-[#13375e]">
            Påmindelse: Du spiller i dag{" "}
            {userMatches
              .map(
                (match: any) =>
                  `kl. ${timeLabel[match.startTime]} på bane ${match.court}`,
              )
              .join(" og ")}
            .
          </p>
        )}
        <section className="mb-6 grid gap-4 lg:grid-cols-[1.45fr_.55fr]">
          <div className="rounded-3xl bg-[#13375e] p-6 text-white shadow-lg sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#c2c9db]">
              {data.event.testActive ? "Spillerunde til test" : "Næste spilledag"}
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
              <div>
                <h1 className="text-3xl font-semibold capitalize sm:text-4xl">
                  {niceDate(data.event.date)}
                </h1>
                <p className="mt-2 text-white/75">
                  Bane 1–4 fra kl. 18 · Bane 5–7 fra kl. 18.30
                </p>
                <div className="flex flex-wrap gap-3">
                  <RulesDialog light />
                  <WaitlistDialog
                    items={data.waitlist ?? []}
                    matches={data.matches}
                    userMatches={userMatches}
                    userLevel={data.user.selfLevel}
                  />
                </div>
              </div>
              <Badge className="bg-white px-4 py-2 text-[#13375e]">
                {data.event.status === "published"
                  ? "Kampplan klar"
                  : data.isOpen
                    ? "Tilmelding åben"
                    : "Tilmelding lukket"}
              </Badge>
            </div>
          </div>
          <Card className="gap-0 border-[#dce9e1] py-0 shadow-none">
            <CardContent className="flex items-center gap-2 px-3 py-2">
              <div className="grid h-7 w-7 place-items-center rounded-xl bg-[#e8edf5] text-[#13375e]">
                <Clock3 className="h-4 w-4" />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Tilmeldingsfrist
                </p>
                <p className="mt-0.5 text-base font-semibold text-slate-900">
                  {data.event.registrationOverride === "open"
                    ? "Tilmelding åben"
                    : data.event.registrationOverride === "closed"
                      ? "Lukket af administrator"
                      : deadlineLabel(data.event.registrationClosesAt)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {data.event.registrationOverride === "auto" ? "Plan senest fredag kl. 12" : "Den normale tidsplan er tilsidesat"}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
        <Tabs defaultValue={openProfile ? "profile" : userMatches.length ? "plan" : "signup"}>
          <TabsList className="mb-6 h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm">
            <TabsTrigger value="signup" className="px-3 py-2">
              <CalendarDays className="mr-2 h-4 w-4" />
              Tilmelding
            </TabsTrigger>
            <TabsTrigger value="plan" className="px-3 py-2">
              <Trophy className="mr-2 h-4 w-4" />
              Kampplan
            </TabsTrigger>
            <TabsTrigger value="profile" className="px-3 py-2">
              <Settings className="mr-2 h-4 w-4" />
              Profil
            </TabsTrigger>
            {data.user.role === "admin" && (
              <TabsTrigger value="admin" className="px-3 py-2">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Admin
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="signup">
            <SignupPanel data={data} act={act} busy={busy} />
          </TabsContent>
          <TabsContent value="plan">
            <PlanPanel data={data} userMatches={userMatches} act={act} busy={busy} />
          </TabsContent>
          <TabsContent value="profile">
            <ProfilePanel key={data.user.id} user={data.user} act={act} busy={busy} />
          </TabsContent>
          {data.user.role === "admin" && (
            <TabsContent value="admin">
              <AdminPanel data={data} act={act} busy={busy} />
            </TabsContent>
          )}
        </Tabs>
        <div className="mb-6"><CalendarList dates={data.calendarDates ?? []} currentId={data.event.id} /></div>
        <InstallApp />
        <Disclaimer />
      </div>
    </main>
  );
}

type CalendarDate = {id:number;date:string;status:string;isTest:boolean;testActive:boolean};
type AppAction = (body: Record<string, unknown>) => Promise<boolean>;

function CalendarList({dates,currentId,act,busy=false}: {dates:CalendarDate[];currentId?:number;act?:AppAction;busy?:boolean}) {
  const [newDate,setNewDate] = useState("");
  const [removing,setRemoving] = useState<CalendarDate|null>(null);
  const [message,setMessage] = useState("");
  async function add(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setMessage("");
    if(act && await act({action:"add_date",date:newDate})){setNewDate("");setMessage("Datoen er tilføjet.");}
  }
  async function remove() {
    if(!act||!removing)return;
    if(await act({action:"remove_date",eventId:removing.id})){setRemoving(null);setMessage("Datoen er fjernet fra listen. Historikken er bevaret.");}
  }
  return <Card className="border-[#dce9e1]">
    <CardHeader><CardTitle>Spilledage</CardTitle><CardDescription>{dates.length} datoer på listen. {act ? "Tilføj nye spilledage, eller fjern datoer fra listen. Tilmeldinger og kampe bevares i historikken." : "Spilledagene fastlægges af administratoren."}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {act && <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2"><Label htmlFor="new-event-date">Ny spilledag</Label><Input id="new-event-date" type="date" required value={newDate} onChange={event=>setNewDate(event.target.value)} /></div>
        <Button disabled={busy||!newDate}>Tilføj dato</Button>
        <p className="w-full text-sm text-slate-600">Du kan også tilføje andre ugedage. Tilmeldingen åbner som standard to dage før kl. 12 og lukker dagen før kl. 12, dansk tid.</p>
      </form>}
      {message && <p role="status" className="text-sm text-[#13375e]">{message}</p>}
      <details open={Boolean(act)}>
        <summary className="cursor-pointer font-semibold text-[#13375e]">Se datolisten</summary>
        {!dates.length && <p className="mt-3 text-sm text-slate-600">Der er ingen datoer på listen.</p>}
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {dates.map(day=><li key={day.id} className="flex items-center justify-between gap-2 rounded-xl border p-3">
            <div><p className="text-sm font-medium capitalize">{fullDate(day.date)}</p>
              <div className="mt-1 flex flex-wrap gap-1">{day.id===currentId&&<Badge>Aktuel runde</Badge>}{day.isTest&&<Badge variant="outline">Test</Badge>}{day.status==="cancelled"&&<Badge variant="outline">Aflyst</Badge>}</div>
            </div>
            {act&&<Button type="button" variant="ghost" size="sm" disabled={busy||day.testActive} title={day.testActive?"Afslut testfasen først":undefined} aria-label={`Fjern ${fullDate(day.date)}`} onClick={()=>setRemoving(day)}><Trash2 className="mr-1 h-4 w-4"/>Fjern</Button>}
          </li>)}
        </ul>
      </details>
      <Dialog open={removing!==null} onOpenChange={open=>{if(!open)setRemoving(null);}}>
        <DialogContent><DialogHeader><DialogTitle>Fjern dato fra listen?</DialogTitle><DialogDescription>{removing&&fullDate(removing.date)} fjernes fra spilledagene. Eksisterende tilmeldinger og kampe bevares i historikken. Datoen kan tilføjes igen senere.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setRemoving(null)}>Annuller</Button><Button disabled={busy} onClick={remove}>Fjern dato</Button></DialogFooter></DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}

function EmptyCalendarDashboard({data,act,busy,error,openProfile}: {
  data:{user:MemberProfile & {id:number;role:string};calendarDates:CalendarDate[]};
  act:AppAction;busy:boolean;error:string;openProfile:boolean;
}) {
  return <main className="min-h-screen bg-[#f4f6fa] px-4 py-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Åben Bane</h1><Button variant="outline" onClick={()=>act({action:"logout"})}><LogOut className="mr-2 h-4 w-4"/>Log ud</Button></div>
      <p className="rounded-xl bg-white p-4">Der er ingen kommende spilledage på listen. {data.user.role==="admin"?"Tilføj en dato nedenfor for at åbne en ny runde.":"Administratoren skal tilføje flere datoer. Du kan stadig ændre din profil."}</p>
      {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      <Tabs defaultValue={openProfile?"profile":"dates"}>
        <TabsList><TabsTrigger value="dates"><CalendarDays className="mr-2 h-4 w-4"/>Spilledage</TabsTrigger><TabsTrigger value="profile"><Settings className="mr-2 h-4 w-4"/>Profil</TabsTrigger></TabsList>
        <TabsContent value="dates"><CalendarList dates={data.calendarDates} act={data.user.role==="admin"?act:undefined} busy={busy}/></TabsContent>
        <TabsContent value="profile"><ProfilePanel user={data.user} act={act} busy={busy}/></TabsContent>
      </Tabs>
    </div><Disclaimer/>
  </main>;
}

type MemberProfile = {
  phone?: string;
  phoneCountryCode?: string;
  christinRanking?: number | null;
  gender: "M" | "K";
  firstName: string;
  lastName: string;
  memberNo: string;
  email: string;
  selfLevel: string;
};

const CR_LABELS = ["", "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-"];

function ProfilePanel({ user, act, busy, adminMode=false }: {
  user: MemberProfile;
  act: (body: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  adminMode?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (await act({ ...values, action: "update_profile" })) setSaved(true);
  }
  return (
    <Card className="max-w-2xl border-[#dce9e1]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />{adminMode ? "Medlemsoplysninger" : "Min profil"}</CardTitle>
        <CardDescription>Kontrollér og opdatér dine oplysninger.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} onChange={() => setSaved(false)} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="firstName" label="Fornavn" defaultValue={user.firstName} autoComplete="given-name" maxLength={100} />
            <Field name="lastName" label="Efternavn" defaultValue={user.lastName} autoComplete="family-name" maxLength={100} />
          </div>
          <Field name="memberNo" label="Medlemsnummer" defaultValue={user.memberNo} readOnly />
          <Field name="email" label="E-mailadresse" type="email" defaultValue={user.email} autoComplete="email" maxLength={254} />
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <Field name="phoneCountryCode" label="Landekode" defaultValue={user.phoneCountryCode ?? "+45"} autoComplete="tel-country-code" pattern="\+[1-9][0-9]{0,2}" maxLength={4} />
            <Field name="phone" label="Telefonnummer (valgfrit)" type="tel" inputMode="numeric" autoComplete="tel-national" defaultValue={user.phone??""} required={false} pattern="[0-9]*" maxLength={15} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-gender">Køn</Label>
            <select id="profile-gender" name="gender" defaultValue={user.gender} required className="h-10 rounded-md border border-input bg-transparent px-3">
              <option value="M">M – Mand</option>
              <option value="K">K – Kvinde</option>
            </select>
          </div>
          <RankingField id="profile-level" defaultValue={user.selfLevel} />
          {adminMode && <div className="grid gap-2"><Label htmlFor="edit-member-cr">CR</Label><select id="edit-member-cr" name="christinRanking" defaultValue={user.christinRanking??""} className="h-10 rounded-md border px-3"><option value="">Ikke vurderet</option>{[1,2,3,4,5,6,7,8,9].map(cr=><option key={cr} value={cr}>{`${cr}  ${CR_LABELS[cr]}`}</option>)}</select></div>}
          <Button disabled={busy} className="bg-[#13375e]">{busy ? "Gemmer…" : "Gem profil"}</Button>
          {saved && <p role="status" className="text-sm font-semibold text-[#13375e]">Din profil er gemt.</p>}
        </form>
      </CardContent>
    </Card>
  );
}

function RankingField({id,defaultValue=""}:{id:string;defaultValue?:string}) {
  return <div className="grid gap-2"><Label htmlFor={id}>Egen ranking</Label><Input id={id} name="level" list={`${id}-options`} defaultValue={defaultValue} placeholder="Fx B+" required maxLength={100}/><datalist id={`${id}-options`}>{levels.map(level=><option key={level} value={level}/>)}</datalist></div>;
}

function EditMemberDialog({player,act,busy}:{player:MemberProfile & {id:number};act:AppAction;busy:boolean}) {
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  async function save(values:Record<string,unknown>) {
    setError('');
    const success=await act({...values,action:'update_member',playerId:player.id,christinRanking:values.christinRanking===''?null:Number(values.christinRanking)});
    if(success)setOpen(false);else setError('Oplysningerne blev ikke gemt. Kontrollér felterne.');
    return success;
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" disabled={busy}><Pencil className="mr-2 h-4 w-4"/>Ret medlem</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Ret {player.firstName} {player.lastName}</DialogTitle><DialogDescription>Medlemsnummeret kan ikke ændres. CR redigeres særskilt og er kun synlig for administratorer.</DialogDescription></DialogHeader><ProfilePanel user={player} act={save} busy={busy} adminMode/>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</DialogContent></Dialog>;
}

function DeleteMemberDialog({player,currentUserId,act,busy}:{player:MemberProfile & {id:number};currentUserId:number;act:AppAction;busy:boolean}) {
  const [open,setOpen]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState('');
  async function remove() {
    setError('');
    if(await act({action:'delete_member',playerId:player.id,confirmMemberNo:player.memberNo}))setOpen(false);
    else setError('Medlemmet blev ikke slettet. Genindlæs listen og prøv igen.');
  }
  return <Dialog open={open} onOpenChange={value=>{setOpen(value);setConfirmed(false);setError('');}}>
    <DialogTrigger asChild><Button variant="destructive" disabled={busy||player.id===currentUserId} title={player.id===currentUserId?'Du kan ikke slette din egen konto':undefined}><Trash2 className="mr-2 h-4 w-4"/>Slet medlem</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Slet {player.firstName} {player.lastName}?</DialogTitle><DialogDescription>Medlemsnummer {player.memberNo}. Medlemsoplysninger, adgang, tilmeldinger og tilknyttede kampinvitationer slettes. Det kan ikke fortrydes. Kampene bevares med teksten “Slettet medlem”; eventuelle kampplaner skal rettes bagefter.</DialogDescription></DialogHeader>
      <label className="flex items-center gap-3 text-sm"><Checkbox checked={confirmed} onCheckedChange={value=>setConfirmed(value===true)}/>Jeg vil slette medlem #{player.memberNo}.</label>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter><DialogClose asChild><Button variant="outline" disabled={busy}>Annuller</Button></DialogClose><Button variant="destructive" disabled={busy||!confirmed} onClick={remove}>{busy?'Sletter…':'Slet medlem permanent'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function SignupPanel({ data, act, busy }: any) {
  const current = data.signup?.status === "not_registered" ? null : data.signup;
  const [selected, setSelected] = useState<string[]>(
    current?.szPossible ?? [],
  );
  const [hours, setHours] = useState(current?.nHours > 0 ? current.nHours : 1);
  const [invites, setInvites] = useState(["", "", ""]);
  const [inviteChecks, setInviteChecks] = useState<Array<{ status: string; name?: string; error?: string }>>([
    { status: "idle" },
    { status: "idle" },
    { status: "idle" },
  ]);
  const [saved, setSaved] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const invitations = (data.requests ?? []).filter(
    (request: any) => request.isInvited && !request.accepted,
  );
  const ownRequests = (data.requests ?? []).filter(
    (request: any) => request.isCreator,
  );
  const canEdit = data.isOpen;
  async function saveWish() {
    setSaved(false);
    setRemoved(false);
    if (
      await act({
        action: "signup",
        szPossible: selected,
        nPossible: selected.length,
        nHours: hours,
      })
    )
      setSaved(true);
  }
  async function removeSignup() {
    setSaved(false);
    if (await act({ action: "cancel_signup" })) {
      setSelected([]);
      setHours(1);
      setRemoved(true);
    }
  }
  async function sendInvites() {
    setInviteSent(false);
    if (await act({ action: "request_match", memberNos: invites }))
      setInviteSent(true);
  }
  async function lookupInvite(index: number, memberNo: string) {
    const value = memberNo.trim();
    if (!value) return;
    setInviteChecks((checks) =>
      checks.map((check, i) => (i === index ? { status: "loading" } : check)),
    );
    try {
      const response = await fetch("/api/app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup_member", memberNo: value }),
      });
      const result = await response.json() as
        | { found: true; name: string }
        | { found: false; error?: string };
      setInviteChecks((checks) =>
        checks.map((check, i) =>
          i === index
            ? result.found
              ? { status: "found", name: result.name }
              : { status: "missing", error: result.error ?? "Medlemsnummeret blev ikke fundet." }
            : check,
        ),
      );
    } catch {
      setInviteChecks((checks) =>
        checks.map((check, i) =>
          i === index ? { status: "missing", error: "Nummeret kunne ikke kontrolleres. Prøv igen." } : check,
        ),
      );
    }
  }
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_.75fr]">
      <Card className="gap-3 border-[#dce9e1] py-4">
        <CardHeader className="gap-1 px-4">
          <CardTitle>Dine spilleønsker</CardTitle>
          <CardDescription>
            Vælg 1-3 timer; vælg ALLE mulige tidspunkter du kan; tryk "Gem mine ønsker"
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          {!data.isOpen && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {data.event.registrationOverride === "closed" ? "Tilmeldingen er lukket af administratoren." : `Tilmelding: ${deadlineLabel(data.event.registrationOpensAt)} til ${deadlineLabel(data.event.registrationClosesAt)}.`}
              {data.user.role === "admin" && " Du kan åbne den under Admin."}
            </p>
          )}
          <div className="mb-4">
            <h3 className="text-base font-semibold">Hvor mange timer?</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[1,2,3].map(value => <button
                key={value}
                disabled={!canEdit}
                aria-pressed={hours === value}
                onClick={() => {
                  setSaved(false);
                  setRemoved(false);
                  setHours(value);
                }}
                className={`min-h-11 rounded-lg border px-2 py-2 text-center text-sm disabled:cursor-not-allowed disabled:opacity-55 ${hours === value ? "border-[#13375e] bg-[#f0f3f8]" : "border-slate-200"}`}
              >
                <strong>{value} {value === 1 ? "time" : "timer"}</strong>

              </button>)}
            </div>
          </div>
          <h3 className="mb-2 text-base font-semibold">Hvornår kan du spille?</h3>
          <div className="space-y-3">
            {[
              {
                title: "Start på hel time",
                subtitle: "Bane 1–4",
                times: data.times.filter((time: string) => !time.endsWith(":30")),
              },
              {
                title: "Start på halv time",
                subtitle: "Bane 5–7",
                times: data.times.filter((time: string) => time.endsWith(":30")),
              },
            ].map((group) => (
              <section key={group.title}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
                  <h3 className="text-sm font-semibold text-slate-950">{group.title}</h3>
                  <p className="text-sm text-slate-500">{group.subtitle}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.times.map((t: string) => (
                    <label
                      key={t}
                      className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 ${canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-55"} ${selected.includes(t) ? "border-[#13375e] bg-[#f0f3f8]" : "border-slate-200"}`}
                    >
                      <Checkbox
                        disabled={!canEdit}
                        checked={selected.includes(t)}
                        onCheckedChange={(yes) => {
                          setSaved(false);
                          setRemoved(false);
                          setSelected(
                            yes
                              ? [...selected, t]
                              : selected.filter((x) => x !== t),
                          );
                        }}
                      />
                      <strong className="text-sm">{timeLabel[t]}</strong>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={busy || selected.length < hours || !canEdit}
              onClick={saveWish}
              className="bg-[#13375e]"
            >
              {busy ? "Gemmer…" : "Gem mine ønsker"}
            </Button>
            {current && data.event.status !== "published" && (
              <Button
                disabled={busy || !canEdit}
                variant="outline"
                onClick={removeSignup}
              >
                Fjern min tilmelding
              </Button>
            )}
          </div>
          {saved && (
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#13375e]">
              <Check className="h-4 w-4" />
              Dine ønsker er gemt.
            </p>
          )}
          {removed && (
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#13375e]">
              <Check className="h-4 w-4" />
              Din tilmelding og dine tidsønsker er fjernet.
            </p>
          )}
          {!saved && current && (
            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-[#13375e]">
              <Check className="h-4 w-4" />
              {current.nHours === 0 ? "Du har valgt ikke at spille." : `Du er ${current.status === "waitlist" ? "på venteliste" : "tilmeldt"}.`}
              Dine senest gemte ønsker vises ovenfor.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanPanel({ data, userMatches, act, busy }: any) {
  const [onlyMine, setOnlyMine] = useState(false);
  const filterButton = <Button variant={onlyMine ? "default" : "outline"} aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>{onlyMine ? "Vis alle kampe" : "Vis kun mine kampe"}</Button>;
  const name = (id: number) =>
    data.names.find((p: any) => p.id === id)?.name ?? "Slettet medlem";
  const importedRows = Array.isArray(data.importedMatches) ? data.importedMatches : [];

  if (importedRows.length > 0) return <div className="space-y-2">{filterButton}<ImportedPlanTable rows={onlyMine ? importedRows.filter((row: Record<string, unknown>) => isPlayersImportedMatch(row, data.user.name)) : importedRows} /></div>;

  if (!data.matches.length && !importedRows.length)
    return (
      <Card className="border-dashed border-[#a9c9b6] bg-white/70">
        <CardContent className="grid min-h-64 place-items-center p-8 text-center">
          <div>
            <Clock3 className="mx-auto h-10 w-10 text-[#13375e]" />
            <h2 className="mt-4 text-xl font-bold">
              Kampplanen er ikke offentliggjort endnu
            </h2>
            <p className="mt-2 text-slate-500">
              Den kommer senest fredag kl. 12.00.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-6">
      {filterButton}
      {onlyMine && userMatches.length === 0 && <p className="text-sm text-slate-500">Der er ingen kampe til dig i kampplanen.</p>}
      {userMatches.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {userMatches.map((m: any) => (
            <PlayerMatchCard
              key={m.id}
              match={m}
              name={name}
              data={data}
              act={act}
              busy={busy}
            />
          ))}
        </div>
      )}
      {!onlyMine && data.matches.length > 0 && (
        <Card className="border-[#dce9e1]">
          <CardHeader>
            <CardTitle>Alle fredagens kampe</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.matches.map((m: any) => (
                <MatchCard key={m.id} match={m} name={name} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlayerMatchCard({ match, name, data, act, busy }: any) {
  const substitution = (data.substitutions ?? []).find(
    (item: any) =>
      item.matchId === match.id && item.outgoingPlayerId === data.user.id,
  );
  const candidates = possibleReplacements(
    data.waitlist ?? [],
    data.matches,
    match,
    data.user.selfLevel,
  );
  return (
    <div className="space-y-3 rounded-2xl border border-[#13375e] bg-[#f0f3f8] p-3">
      <MatchCard match={match} name={name} highlight />
      {!substitution ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              disabled={busy}
              variant="outline"
              className="w-full border-[#13375e] bg-white text-[#13375e]"
            >
              Jeg kan ikke spille – find afløser
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl text-[#13375e]">Venteliste</DialogTitle>
              <DialogDescription>
                Se, hvem der aktuelt står på ventelisten til denne spillerunde.
              </DialogDescription>
            </DialogHeader>
            {!((data.waitlist ?? []).length) ? (
              <p className="rounded-xl bg-slate-50 p-5 text-center text-slate-600">
                Der er ingen på ventelisten endnu.
              </p>
            ) : (
              <div className="space-y-3">
                {((data.waitlist ?? []).filter((player: any) =>
                  possibleReplacements((data.waitlist ?? []), data.matches, match, data.user.selfLevel)
                    .some((candidate: any) => candidate.id === player.id)
                )).length ? (
                  ((data.waitlist ?? []).filter((player: any) =>
                    possibleReplacements((data.waitlist ?? []), data.matches, match, data.user.selfLevel)
                      .some((candidate: any) => candidate.id === player.id)
                  )).map((player: any) => (
                    <div key={player.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <Badge className="bg-[#e8edf5] text-[#13375e]">{player.level}</Badge>
                        <span className="font-semibold">{player.name}</span>
                      </div>
                      <a href={`mailto:${player.email}`} className="mt-2 inline-block text-sm text-[#13375e] underline">
                        {player.email}
                      </a>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
                    Ingen på ventelisten passer til både tiden og dit niveau.
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button className="bg-[#13375e]">Luk ventelisten</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : substitution.status === "unresolved" ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">Administratoren har fået besked.</p>
          <p className="mt-1">Du kan stadig prøve at finde en afløser igen.</p>
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            className="mt-3 bg-white"
            onClick={() => act({ action: "resume_substitute_search", matchId: match.id })}
          >
            Prøv igen
          </Button>
        </div>
      ) : (
        <div className="rounded-xl bg-white p-4">
          <p className="font-bold text-[#13375e]">Find en afløser</p>
          <p className="mt-1 text-sm text-slate-600">
            Det er dit eget ansvar at kontakte spilleren. Vælg først personen
            som afløser i appen, når vedkommende selv har sagt ja. Derefter
            ændres kampplanen med det samme.
          </p>
          {!candidates.length ? (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Der er ingen på ventelisten, som passer til både tiden og dit niveau.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {candidates.map((player: any) => (
                <div key={player.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{player.name} · niveau {player.level}</p>
                      {player.email ? (
                        <a className="text-sm text-[#13375e] underline" href={`mailto:${player.email}`}>
                          {player.email}
                        </a>
                      ) : (
                        <p className="text-sm text-slate-500">Ingen e-mail oplyst</p>
                      )}
                    </div>
                    <div className="w-full sm:w-auto sm:max-w-56">
                      <p className="mb-2 text-sm font-semibold text-amber-900">
                        Dit eget ansvar: Tryk først, når {player.name} har sagt ja.
                      </p>
                      <Button
                        disabled={busy}
                        size="sm"
                        className="w-full bg-[#13375e]"
                        onClick={() => act({ action: "confirm_substitute", matchId: match.id, replacementPlayerId: player.id })}
                      >
                        Vælg som afløser
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button
            disabled={busy}
            variant="ghost"
            className="mt-3 w-full text-amber-900"
            onClick={() => act({ action: "mark_substitute_unresolved", matchId: match.id })}
          >
            Jeg kan ikke finde en afløser – giv administrator besked
          </Button>
        </div>
      )}
    </div>
  );
}
function MatchCard({ match, name, highlight }: any) {
  const ids = JSON.parse(match.playerIds);
  return (
    <article
      className={`rounded-2xl border p-4 ${highlight ? "border-[#13375e] bg-[#f0f3f8]" : "border-slate-200 bg-white"}`}
    >
      <div className="flex items-center justify-between">
        <Badge variant="outline">Bane {match.court}</Badge>
        <span className="font-bold text-[#13375e]">
          Kl. {timeLabel[match.startTime]}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div>
          <p className="font-semibold">{name(ids[0])}</p>
          <p className="font-semibold">{name(ids[1])}</p>
        </div>
        <span className="text-xs font-black text-slate-400">VS</span>
        <div className="text-right">
          <p className="font-semibold">{name(ids[2])}</p>
          <p className="font-semibold">{name(ids[3])}</p>
        </div>
      </div>
    </article>
  );
}

function AdminPanel({ data, act, busy }: any) {
  const sortedMembers = [...data.players].sort((a: MemberProfile, b: MemberProfile) => `${a.firstName} ${a.lastName}`.trim().localeCompare(`${b.firstName} ${b.lastName}`.trim(), "da", { sensitivity: "base" }));
  const [editing, setEditing] = useState<number | null>(null);
  const [listView, setListView] = useState<"current" | "history">("current");
  const [testEmailResult, setTestEmailResult] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const activeSignups = data.signups.filter(
    (x: any) => x.signup.status === "active" && x.signup.nHours > 0,
  );
  const waitingSignups = data.signups.filter(
    (x: any) => x.signup.status === "waitlist",
  );
  const draftMatches = data.adminMatches ?? [];
  const importedRows = Array.isArray(data.importedMatches) ? data.importedMatches : [];
  const hasImportedPlan = importedRows.length > 0;
  const unusedCourts = unusedImportedCourts(importedRows, data.times);
  const name = (id: number) =>
    data.names.find((p: any) => p.id === id)?.name ?? "Slettet medlem";
  const openSubstitutions = (data.substitutions ?? []).filter(
    (item: any) => item.status !== "replaced",
  );
  return (
    <Tabs defaultValue="signups" className="space-y-6">
      <TabsList aria-label="Admin" className="flex h-auto w-full flex-wrap justify-start gap-1 bg-[#e7f0e9] p-1 group-data-[orientation=horizontal]/tabs:h-auto [&>button]:h-auto">
        <TabsTrigger value="signups" className="min-h-9 px-2.5">Tilmeldinger</TabsTrigger>
        <TabsTrigger value="matches" className="min-h-9 px-2.5">Kampplan Admin</TabsTrigger>
        <TabsTrigger value="members" className="min-h-9 px-2.5">Medlemmer</TabsTrigger>
        <TabsTrigger value="dates" className="min-h-9 px-2.5">Spilledage</TabsTrigger>
        <TabsTrigger value="settings" className="min-h-9 px-2.5">Indstillinger</TabsTrigger>
      </TabsList>
      <TabsContent value="dates" className="space-y-6">
      <CalendarList dates={data.calendarDates ?? []} currentId={data.event.id} act={act} busy={busy} />
      </TabsContent>
      <TabsContent value="signups" className="space-y-6">
      <Card className="border-[#dce9e1]">
        <CardHeader>
          <CardTitle>Åbn og luk tilmeldingen</CardTitle>
          <CardDescription>Gælder {niceDate(data.event.date)} for alle medlemmer. Manuel åbning og lukning tilsidesætter de normale tidspunkter.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p role="status" className="font-semibold">Tilmelding: {data.isOpen ? "Åben" : "Lukket"} · {data.event.registrationOverride === "auto" ? "Følger tidsplanen" : "Manuelt styret"}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} aria-pressed={data.event.registrationOverride === "open"} onClick={() => act({action:"set_registration",mode:"open"})}>Åbn tilmelding</Button>
            <Button disabled={busy} variant="outline" aria-pressed={data.event.registrationOverride === "closed"} onClick={() => act({action:"set_registration",mode:"closed"})}>Luk tilmelding</Button>
            <Button disabled={busy} variant="outline" aria-pressed={data.event.registrationOverride === "auto"} onClick={() => act({action:"set_registration",mode:"auto"})}>Følg tidsplan</Button>
          </div>
          {data.event.testActive && <Dialog>
            <DialogTrigger asChild><Button variant="outline" disabled={busy}>Afslut testfase</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Afslut testfasen?</DialogTitle><DialogDescription>Testrunden lukkes og bevares i historikken. Forsiden viser derefter den næste almindelige spillerunde.</DialogDescription></DialogHeader>
              <DialogFooter><DialogClose asChild><Button variant="outline">Annuller</Button></DialogClose><Button disabled={busy} onClick={() => act({action:"end_test"})}>Afslut testfase</Button></DialogFooter>
            </DialogContent>
          </Dialog>}
        </CardContent>
      </Card>
      <PlayerLists data={data} view={listView} setView={setListView} act={act} busy={busy} />
      </TabsContent>
      <TabsContent value="matches" className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <AdminSummaryDialog
          icon={<Users />}
          label="Tilmeldte"
          value={activeSignups.length}
          emptyText="Der er ingen tilmeldte endnu."
        >
          {activeSignups.map(({ player }: any) => (
            <SummaryPlayer key={player.id} player={player} />
          ))}
        </AdminSummaryDialog>
        <AdminSummaryDialog
          icon={<Clock3 />}
          label="Venteliste"
          value={waitingSignups.length}
          emptyText="Der er ingen på ventelisten."
        >
          {waitingSignups.map(({ player }: any) => (
            <SummaryPlayer key={player.id} player={player} />
          ))}
        </AdminSummaryDialog>
        <AdminSummaryDialog
          icon={<Trophy />}
          label="Kampe"
              value={draftMatches.length}
          emptyText="Der er ikke lavet nogen kampe endnu."
        >
          {draftMatches.map((match: any) => (
            <MatchCard key={match.id} match={match} name={name} />
          ))}
        </AdminSummaryDialog>
      </section>
      {!!openSubstitutions.length && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle>Afløsere – kræver opmærksomhed</CardTitle>
            <CardDescription className="text-amber-950/75">
              Spillere, der søger en afløser til en offentliggjort kamp.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {openSubstitutions.map((item: any) => {
              const match = draftMatches.find((entry: any) => entry.id === item.matchId);
              return (
                <div key={item.id} className="rounded-xl border border-amber-200 bg-white p-4">
                  <p className="font-bold">{item.outgoingName}</p>
                  <p className="text-sm text-slate-700">
                    {match ? `Kl. ${timeLabel[match.startTime]} · bane ${match.court}` : "Kampen kunne ikke findes"}
                  </p>
                  <Badge className={`mt-2 ${item.status === "unresolved" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                    {item.status === "unresolved" ? "Kan ikke finde afløser" : "Søger afløser"}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          onClick={() => act({ action: "generate" })}
          className="bg-[#13375e]"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Foreslå kampe
        </Button>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <label htmlFor="import-kampplan" className="text-sm font-medium text-slate-700">
            Importér kampplan
          </label>
          <input
            id="import-kampplan"
            type="file"
            accept=".xlsx,.xls"
            className="block max-w-[220px] text-sm text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-[#13375e] file:px-2 file:py-1 file:text-white"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setIsImporting(true);
              setUploadError("");
              try {
                const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
                const rows = parseWorkbookKampplanRows(workbook);
                if (!rows.length) {
                  setUploadError("Ingen gældige rækker blev fundet i Kampplan-arket.");
                  return;
                }
                const ok = await act({ action: "import_kampplan", schedule: rows });
                if (ok) {
                  event.target.value = "";
                }
              } catch (error) {
                setUploadError(error instanceof Error ? error.message : "Kampplanen kunne ikke importeres.");
              } finally {
                setIsImporting(false);
              }
            }}
          />
        </div>
        <Button
          disabled={busy || (!draftMatches.length && !data.importedMatches?.length)}
          variant="outline"
          onClick={() => act({ action: "publish" })}
        >
          Offentliggør kampplan
        </Button>
        <Button
          variant="outline"
          disabled={busy || (!draftMatches.length && !data.importedMatches?.length)}
          onClick={() => {
            if (window.confirm("Fjern kampplanen for denne spilledag? Tilmeldingerne bevares."))
              void act({ action: "remove_kampplan" });
          }}
        >
          Fjern kampplan
        </Button>
      </div>
      {isImporting && (
        <p className="rounded-xl border border-[#dce9e1] bg-[#f0f3f8] p-3 text-sm font-medium text-[#13375e]">
          Læser kampplanen…
        </p>
      )}
      {uploadError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {uploadError}
        </p>
      )}
      {Array.isArray(data.importedMatches) && data.importedMatches.length > 0 && (
        <ImportedPlanTable rows={data.importedMatches} />
      )}
      <Card className="border-[#dce9e1]">
        <CardHeader>
          <CardTitle>Baner, der ikke bruges</CardTitle>
          <CardDescription>
            {hasImportedPlan ? "Disse baner er uden kamp i den indlæste kampplan og kan derfor aflyses i banebookingen." : "Indlæsning af kampplan mangler."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasImportedPlan ? null : !unusedCourts.length ? (
            <p className="rounded-xl bg-[#f0f3f8] p-4 font-semibold text-[#13375e]">
              Alle reserverede baner bruges.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {unusedCourts.map((slot: any) => (
                <div
                  key={slot.time}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="font-bold text-[#13375e]">
                    {timeLabel[slot.time]}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {slot.courts
                      .map((court: number) => `Bane ${court}`)
                      .join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent>
      <TabsContent value="members" className="space-y-6">
      <Card className="border-[#dce9e1]">
        <CardHeader><CardTitle>Medlemmer og Christin Ranking</CardTitle><CardDescription>Nye medlemmer får CR ud fra deres egen ranking ved oprettelse. Du kan rette vurderingen til et heltal fra 1 til 9. CR er kun synlig for administratorer.</CardDescription></CardHeader>
        <CardContent className="space-y-1.5">
          {sortedMembers.map((player: MemberProfile & {id:number;name:string;christinRanking:number|null}) => <div key={player.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 [&_button]:h-8 [&_button]:px-2 [&_button]:text-xs">
            <div className="min-w-0 flex-1 basis-full sm:basis-48"><p className="text-sm font-semibold leading-5">{player.firstName} {player.lastName}</p><p className="break-words text-xs leading-4 text-slate-600">#{player.memberNo} · Egen ranking: {player.selfLevel} · {player.email}{player.phone && <> · {player.phoneCountryCode ?? "+45"} {player.phone}</>}</p></div>
            <div className="flex items-center gap-2"><Label className="text-xs" htmlFor={`cr-${player.id}`}>CR</Label><select id={`cr-${player.id}`} aria-label={`Christin Ranking for ${player.name}`} disabled={busy} value={player.christinRanking ?? ""} className="h-8 rounded-md border px-2 text-sm" onChange={e => act({action:"set_cr",playerId:player.id,christinRanking:e.target.value === "" ? null : Number(e.target.value)})}>
              <option value="">Ikke vurderet</option>{[1,2,3,4,5,6,7,8,9].map(cr => <option key={cr} value={cr}>{`${cr}  ${CR_LABELS[cr]}`}</option>)}
            </select></div>
            <EditMemberDialog player={player} act={act} busy={busy}/>
            <DeleteMemberDialog player={player} currentUserId={data.user.id} act={act} busy={busy}/>
          </div>)}
        </CardContent>
      </Card>
      </TabsContent>
      <TabsContent value="settings" className="space-y-6">
      <AdminManagers data={data} act={act} busy={busy} />
      <Card className="border-[#dce9e1]">
        <CardHeader>
          <CardTitle>Eksport til Excel</CardTitle>
          <CardDescription>
            Downloader den aktuelle tilmeldingsliste som en Excel-fil direkte til din enhed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            disabled={busy}
            className="bg-[#13375e]"
            onClick={async () => {
              const response = await fetch("/api/app", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "export_signups" }),
              });

              if (!response.ok) {
                const body = await response.json().catch(() => ({})) as { error?: string };
                throw new Error(body.error || "Eksporten kunne ikke genereres.");
              }

              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "Aabenbane.xlsx";
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Download Excel
          </Button>
        </CardContent>
      </Card>
      <Card className="border-[#dce9e1]">
        <CardHeader>
          <CardTitle>Test e-mail</CardTitle>
          <CardDescription>
            Kontrollér e-mailfunktionen, før kampplanen sendes til spillerne.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-700">Modtager: {data.user.email || "Ingen e-mailadresse angivet"}</p>
          <Button
            disabled={busy}
            variant="outline"
            onClick={async () => {
              setTestEmailResult("");
              if (await act({ action: "send_test_email" })) {
                setTestEmailResult(`Testmailen er sendt til ${data.user.email}.`);
              }
            }}
          >
            <Mail className="mr-2 h-4 w-4" />
            Send testmail
          </Button>
          {testEmailResult && (
            <p className="rounded-xl bg-[#f0f3f8] p-3 text-sm font-semibold text-[#13375e]">
              {testEmailResult}
            </p>
          )}
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
  );
}

function AdminManagers({ data, act, busy }: any) {
  const admins = data.players.filter((p: any) => p.role === "admin");
  const candidates = data.players.filter((p: any) => p.role !== "admin");
  const [selected, setSelected] = useState("");
  async function addAdmin() {
    if (
      await act({
        action: "set_admin",
        playerId: Number(selected),
        makeAdmin: true,
      })
    )
      setSelected("");
  }
  return (
    <Card className="border-[#dce9e1]">
      <CardHeader>
        <CardTitle>Administratorer</CardTitle>
        <CardDescription>
          Du kan udpege op til tre ekstra administratorer. De skal først have
          oprettet en almindelig spillerprofil.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 space-y-2">
          {admins.map((p: any) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div>
                <p className="font-semibold">
                  {p.name}
                  {p.id === data.user.id ? " · Dig" : ""}
                </p>
                <p className="text-sm text-slate-500">
                  Medlemsnr. #{p.memberNo}
                </p>
              </div>
              {p.id !== data.user.id && (
                <Button
                  disabled={busy || admins.length <= 1}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    act({
                      action: "set_admin",
                      playerId: p.id,
                      makeAdmin: false,
                    })
                  }
                >
                  Fjern som administrator
                </Button>
              )}
            </div>
          ))}
        </div>
        <p className="mb-3 text-sm font-medium text-slate-600">
          {admins.length} af 4 administratorpladser er i brug.
        </p>
        {admins.length < 4 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="sm:max-w-sm">
                <SelectValue placeholder="Vælg en registreret spiller" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} · #{p.memberNo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={busy || !selected}
              onClick={addAdmin}
              className="bg-[#13375e]"
            >
              Gør til administrator
            </Button>
          </div>
        )}
        {!candidates.length && admins.length < 4 && (
          <p className="text-sm text-slate-500">
            Der kommer flere valgmuligheder, når andre spillere har oprettet
            deres profil.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PlayerLists({ data, view, setView, act, busy }: any) {
  const statuses: Record<string,string> = { active: "Tilmeldt", waitlist: "Venteliste", cancelled: "Afbud", not_registered: "Ikke tilmeldt" };
  const sortedRows = (view === "current" ? data.signups.map((row:any)=>({...row,event:data.event})) : [...data.signupHistory])
    .sort((a:any,b:any)=>a.player.name.trim().localeCompare(b.player.name.trim(), "da", { sensitivity: "base" }));
  const rows = sortedRows.filter((row:any)=>row.signup.status !== "not_registered");
  const notRegistered = sortedRows.filter((row:any)=>row.signup.status === "not_registered");
  return <Card className="gap-3 border-[#a9c9b6] py-3">
    <CardHeader className="px-3"><CardTitle>Spillerlister</CardTitle></CardHeader>
    <CardContent className="px-3">
      <div className="mb-2 flex gap-1 rounded-lg bg-[#edf1f7] p-1">
        {[["current",`Denne fredag (${data.signups.filter((row:any)=>row.signup.status !== "not_registered").length})`],["history",`Tidligere (${data.signupHistory.length})`]].map(([value,label])=><button key={value} onClick={()=>setView(value)} className={`rounded-md px-3 py-1 text-xs font-semibold ${view===value ? "bg-white text-[#13375e] shadow-sm" : "text-slate-600"}`}>{label}</button>)}
      </div>
      {!rows.length ? <p className="py-3 text-sm text-slate-500">Der er ingen tilmeldinger på listen endnu.</p> : <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr className="border-b text-slate-500">{["Status","Navn","CR","Timer","Antal mulige tider","Ønskede tider","Tilmeldingsrækkefølge"].map(label=><th key={label} className="px-2 py-0.5 font-medium">{label}</th>)}</tr></thead>
          <tbody>{rows.map(({signup,player,event}:any)=><tr key={`${event.id}-${player.id}`} className="border-b last:border-0">
            <td className="px-2 py-0.5"><select aria-label={`Status for ${player.name}`} title={!signup.id ? "Medlemmet skal først angive timer og mulige tider." : undefined} value={signup.status} disabled={busy || !signup.id} style={{ fontSize: "inherit" }} className="h-6 rounded border bg-white px-1 py-0 text-xs leading-tight" onChange={e=>act({action:"set_signup_status",signupId:signup.id,status:e.target.value})}>
              {Object.entries(statuses).filter(([value])=>value!=="not_registered").map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select></td>
            <td className="whitespace-nowrap px-2 py-0.5 font-semibold">{player.name}</td>
            <td className="whitespace-nowrap px-2 py-0.5">{player.christinRanking == null ? "–" : `${player.christinRanking} ${CR_LABELS[player.christinRanking]}`}</td>
            <td className="px-2 py-0.5">{signup.nHours}</td>
            <td className="px-2 py-0.5">{signup.nPossible}</td>
            <td className="whitespace-nowrap px-2 py-0.5">{signup.szPossible.join(", ")}</td>
            <td className="px-2 py-0.5">{signup.nHours > 0 ? signup.signupOrder ?? "–" : "–"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {view === "current" && <section className="mt-4 border-t pt-3" aria-label="Ikke tilmeldt">
        <h3 className="mb-2 text-sm font-semibold">Ikke tilmeldt ({notRegistered.length})</h3>
        {!notRegistered.length ? <p className="text-xs text-slate-500">Alle medlemmer har registreret en tilmelding eller et afbud.</p> : <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b text-slate-500">{["Status","Navn","CR","Timer","Antal mulige tider","Ønskede tider","Tilmeldingsrækkefølge"].map(label=><th key={label} className="px-2 py-0.5 font-medium">{label}</th>)}</tr></thead>
            <tbody>{notRegistered.map(({player}:any)=><tr key={player.id} className="border-b last:border-0">
              <td className="whitespace-nowrap px-2 py-0.5">Ikke tilmeldt</td>
              <td className="whitespace-nowrap px-2 py-0.5 font-semibold">{player.name}</td>
              <td className="whitespace-nowrap px-2 py-0.5">{player.christinRanking == null ? "–" : `${player.christinRanking} ${CR_LABELS[player.christinRanking]}`}</td>
              <td className="px-2 py-0.5">0</td><td className="px-2 py-0.5">0</td>
              <td className="px-2 py-0.5">–</td><td className="px-2 py-0.5">–</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>}
    </CardContent>
  </Card>;
}
function EditMatch({ match, data, act, done }: any) {
  const [ids, setIds] = useState<number[]>(JSON.parse(match.playerIds)),
    [court, setCourt] = useState(String(match.court)),
    [time, setTime] = useState(match.startTime),
    [locked, setLocked] = useState(match.locked);
  return (
    <div className="rounded-2xl border-2 border-[#13375e] bg-[#f6f8fb] p-4">
      <p className="mb-3 font-bold text-[#13375e]">Rediger kamp</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tidspunkt</Label>
          <Select value={time} onValueChange={setTime}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.times.map((t: string) => (
                <SelectItem key={t} value={t}>
                  {timeLabel[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={`court-${match.id}`}>Bane</Label>
          <Input
            id={`court-${match.id}`}
            className="mt-1"
            type="number"
            min="1"
            max="7"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
          />
        </div>
      </div>
      <p className="mb-1 mt-4 text-sm font-semibold">Spillere</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ids.map((id, i) => (
          <Select
            key={i}
            value={String(id)}
            onValueChange={(v) =>
              setIds(ids.map((x, n) => (n === i ? Number(v) : x)))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.players.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name} · {p.adminLevel ?? p.selfLevel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <Checkbox
          checked={locked}
          onCheckedChange={(v) => setLocked(Boolean(v))}
        />
        <Lock className="h-4 w-4" />
        Lås kampen
      </label>
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          onClick={async () => {
            await act({
              action: "update_match",
              id: match.id,
              court,
              startTime: time,
              playerIds: ids,
              locked,
            });
            done();
          }}
        >
          Gem ændringer
        </Button>
        <Button size="sm" variant="ghost" onClick={done}>
          Annuller
        </Button>
      </div>
    </div>
  );
}
function AdminSummaryDialog({
  icon,
  label,
  value,
  emptyText,
  children,
}: any) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="w-full rounded-xl border border-[#dce9e1] bg-white p-5 text-left shadow-sm transition hover:border-[#a9c9b6] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13375e]">
          <span className="flex items-center gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8edf5] text-[#13375e]">
              {icon}
            </span>
            <span>
              <strong className="block text-2xl">{value}</strong>
              <span className="text-sm text-slate-500">{label}</span>
            </span>
          </span>
          <span className="mt-3 block text-sm font-semibold text-[#13375e]">
            Tryk for at se {label.toLowerCase()}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-[#13375e]">
            {label} ({value})
          </DialogTitle>
          <DialogDescription>
            Oversigt for den aktuelle fredag.
          </DialogDescription>
        </DialogHeader>
        {value ? (
          <div className="space-y-2">{children}</div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-5 text-center text-slate-500">
            {emptyText}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button className="bg-[#13375e]">Luk oversigten</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function SummaryPlayer({ player }: any) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
      <div>
        <p className="font-semibold">{player.name}</p>
        <p className="text-sm text-slate-500">Medlemsnr. #{player.memberNo}</p>
      </div>
      <Badge className="bg-[#e8edf5] text-[#13375e]">
        {player.adminLevel ?? player.selfLevel}
      </Badge>
    </div>
  );
}
function Field({ label, ...props }: any) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} required {...props} />
    </div>
  );
}
function SelectField({ name, label, options }: any) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <select
        name={name}
        required
        defaultValue=""
        className="h-10 rounded-md border border-input bg-transparent px-3"
      >
        <option value="" disabled>
          Vælg
        </option>
        {options.map((o: string) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}






