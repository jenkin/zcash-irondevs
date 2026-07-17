"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const assetPath = (path: string) => `${BASE_PATH}${path}`;

type SheetSurface =
  | "kraft"
  | "parchment"
  | "cotton"
  | "ledger"
  | "blueprint"
  | "thermal"
  | "eink"
  | "crt"
  | "terminal"
  | "agent"
  | "cli";

type Era = {
  date: string;
  year: string;
  chapter: string;
  kicker: string;
  machine: string;
  machineIndex: number;
  story: string;
  code: string;
  people?: number;
  commits?: number;
  ties?: number;
  stats?: Array<{ label: string; value: string }>;
  figures?: Array<{ name: string; role: string }>;
  phase?: "ORIGINS" | "ZCASH";
  accent: string;
  logo?: string;
  logoStyle?: "tree" | "wide" | "zebra";
  cardArt?: string;
  cardArtTone?: "green" | "paper";
  surface?: SheetSurface;
  mark: string;
  source: string;
};

const SURFACE_LABELS: Record<SheetSurface, string> = {
  kraft: "KRAFT STOCK",
  parchment: "ARCHIVE PARCHMENT",
  cotton: "COTTON RAG",
  ledger: "TECHNICAL LEDGER",
  blueprint: "BLUEPRINT FILM",
  thermal: "THERMAL STOCK",
  eink: "E-INK SHEET",
  crt: "CRT GLASS",
  terminal: "TERMINAL PANEL",
  agent: "AGENT CONSOLE",
  cli: "MULTI-AGENT CLI",
};

const ERAS: Era[] = [
  {
    date: "MAY 2013",
    year: "2013",
    chapter: "Zerocoin",
    kicker: "PRIVACY RETURNS TO THE LEDGER",
    machine: "Research workstation",
    machineIndex: 4,
    story:
      "Zerocoin breaks the public link between a coin's origin and its redemption.",
    code: "mint(commitment)\nspend(zero_knowledge_proof)",
    stats: [
      { label: "SYSTEM", value: "ZEROCOIN" },
      { label: "PROOF", value: "ZERO-KNOWLEDGE" },
      { label: "ROOT", value: "BITCOIN" },
    ],
    figures: [
      { name: "Ian Miers", role: "Co-author" },
      { name: "Christina Garman", role: "Co-author" },
      { name: "Matthew Green", role: "Co-author" },
      { name: "Aviel D. Rubin", role: "Co-author" },
    ],
    phase: "ORIGINS",
    accent: "#74b6a2",
    cardArt: "/editorial/zerocoin-cover.png",
    cardArtTone: "green",
    mark: "ZC",
    source: "https://ieeexplore.ieee.org/document/6547123",
  },
  {
    date: "MAY 2014",
    year: "2014",
    chapter: "Zerocash",
    kicker: "PRIVATE PAYMENTS, END TO END",
    machine: "Cryptography workstation",
    machineIndex: 4,
    story:
      "Zerocash hides sender, receiver and amount with compact zk-SNARK proofs.",
    code: "prove(sender, receiver, amount)\nverify(proof)",
    stats: [
      { label: "PROOF", value: "zk-SNARK" },
      { label: "HIDES", value: "ALL THREE" },
      { label: "VERIFY", value: "< 6 ms" },
    ],
    figures: [
      { name: "Eli Ben-Sasson", role: "Co-author" },
      { name: "Alessandro Chiesa", role: "Co-author" },
      { name: "Christina Garman", role: "Co-author" },
      { name: "Matthew Green", role: "Co-author" },
      { name: "Ian Miers", role: "Co-author" },
      { name: "Eran Tromer", role: "Co-author" },
      { name: "Madars Virza", role: "Co-author" },
    ],
    phase: "ORIGINS",
    accent: "#78c8b3",
    cardArt: "/editorial/zerocash-paper.png",
    cardArtTone: "paper",
    mark: "Z$",
    source: "https://zerocash-project.org/paper",
  },
  {
    date: "OCTOBER 2016",
    year: "2016",
    chapter: "Sprout",
    kicker: "MAINNET",
    machine: "Developer laptop",
    machineIndex: 4,
    surface: "kraft",
    story:
      "Zcash launches. Private digital cash is now live.",
    code: "$ zcashd --mainnet\nupgrade.activate(\"Sprout\")",
    people: 6,
    commits: 429,
    ties: 13,
    accent: "#f4b728",
    logo: "/upgrades/sprout.png",
    logoStyle: "wide",
    mark: "SP",
    source: "https://electriccoin.co/blog/sprout-roadmap/",
  },
  {
    date: "JUNE 2018",
    year: "2018",
    chapter: "Overwinter",
    kicker: "NETWORK UPGRADE 0",
    machine: "Developer laptop",
    machineIndex: 4,
    surface: "parchment",
    story:
      "The first upgrade adds safer versioning and replay protection.",
    code: "branch.id = \"Overwinter\"\nreplay_protection = true",
    people: 10,
    commits: 879,
    ties: 43,
    accent: "#9eb7c9",
    mark: "OW",
    source: "https://z.cash/upgrade/overwinter/",
  },
  {
    date: "OCTOBER 2018",
    year: "2018",
    chapter: "Sapling",
    kicker: "SHIELDED, MADE PRACTICAL",
    machine: "Developer laptop",
    machineIndex: 4,
    surface: "cotton",
    story:
      "Shielded payments become lighter, faster and ready for mobile wallets.",
    code: "shielded.send({\n  protocol: \"Sapling\"\n})",
    people: 13,
    commits: 1017,
    ties: 76,
    accent: "#7ac943",
    logo: "/upgrades/sapling.png",
    logoStyle: "tree",
    mark: "SA",
    source: "https://z.cash/upgrade/sapling/",
  },
  {
    date: "DECEMBER 2019",
    year: "2019",
    chapter: "Blossom",
    kicker: "ZEBRA EMERGES",
    machine: "Mechanical 75%",
    machineIndex: 5,
    surface: "ledger",
    story:
      "Block time falls to 75 seconds as the Rust node Zebra emerges.",
    code: "block.time = 75s\nnode.preview(\"zebrad\")",
    people: 33,
    commits: 1837,
    ties: 412,
    accent: "#dc7aaa",
    logo: "/upgrades/blossom.png",
    logoStyle: "tree",
    mark: "BL",
    source: "https://z.cash/upgrade/blossom/",
  },
  {
    date: "JULY 2020",
    year: "2020",
    chapter: "Heartwood",
    kicker: "SHIELDED COINBASE",
    machine: "Mechanical 75%",
    machineIndex: 5,
    surface: "blueprint",
    story:
      "Miners can send block rewards directly to shielded addresses.",
    code: "coinbase.to(\"Sapling\")\nflyclient.enable()",
    people: 43,
    commits: 3007,
    ties: 677,
    accent: "#eea048",
    logo: "/upgrades/heartwood.png",
    logoStyle: "tree",
    mark: "HW",
    source: "https://z.cash/upgrade/heartwood/",
  },
  {
    date: "NOVEMBER 2020",
    year: "2020",
    chapter: "Canopy",
    kicker: "THE FIRST HALVING",
    machine: "Mechanical 75%",
    machineIndex: 5,
    surface: "thermal",
    story:
      "The first halving brings new funding and retires new Sprout value.",
    code: "funding.streams()\nsprout.deprecate()",
    people: 47,
    commits: 4014,
    ties: 829,
    accent: "#6fbe78",
    logo: "/upgrades/canopy.png",
    logoStyle: "tree",
    mark: "CA",
    source: "https://z.cash/upgrade/canopy/",
  },
  {
    date: "MAY 2022",
    year: "2022",
    chapter: "NU5 · Halo 2",
    kicker: "ORCHARD",
    machine: "Low-profile 75%",
    machineIndex: 5,
    surface: "eink",
    story:
      "Halo 2 removes trusted setup as Orchard and Unified Addresses arrive.",
    code: "proof = Halo2.recursive()\npool = new Orchard()",
    people: 62,
    commits: 6701,
    ties: 1238,
    accent: "#f4b728",
    logo: "/upgrades/halo.png",
    logoStyle: "wide",
    mark: "H2",
    source: "https://z.cash/upgrade/nu5/",
  },
  {
    date: "JUNE 2023",
    year: "2023",
    chapter: "Zebra 1.0",
    kicker: "A SECOND FULL NODE",
    machine: "Low-profile 65%",
    machineIndex: 5,
    surface: "crt",
    story:
      "Zebra 1.0 becomes Zcash's stable, audited Rust full node.",
    code: "$ cargo run --release --bin zebrad\nconsensus.sync()",
    people: 75,
    commits: 8208,
    ties: 1756,
    accent: "#dfa328",
    logo: "/upgrades/zebra.png",
    logoStyle: "zebra",
    mark: "ZB",
    source: "https://zfnd.org/zebra-stable-release/",
  },
  {
    date: "NOVEMBER 2024",
    year: "2024",
    chapter: "NU6",
    kicker: "THE SECOND HALVING",
    machine: "Compact coding keyboard",
    machineIndex: 6,
    surface: "terminal",
    story:
      "The second halving activates as Zebra joins zcashd at the network core.",
    code: "network.upgrade(\"NU6\")\nblock.balance.exact()",
    people: 110,
    commits: 10092,
    ties: 3262,
    accent: "#c5a4e8",
    mark: "N6",
    source: "https://z.cash/upgrade/nu6/",
  },
  {
    date: "NOVEMBER 2025",
    year: "2025",
    chapter: "NU6.1",
    kicker: "ZEBRA TAKES THE LEAD",
    machine: "Codex compact",
    machineIndex: 6,
    surface: "agent",
    story:
      "Community funding evolves while full-node work moves toward Zebra.",
    code: "network.upgrade(\"NU6.1\")\nnode.default = \"zebrad\"",
    people: 155,
    commits: 13512,
    ties: 5544,
    accent: "#80c7c5",
    mark: "6.1",
    source: "https://z.cash/upgrade/nu6-1/",
  },
  {
    date: "JULY 28, 2026",
    year: "2026",
    chapter: "NU6.3 · Ironwood",
    kicker: "THE NEXT SHIELDED POOL",
    machine: "Codex mini",
    machineIndex: 6,
    surface: "cli",
    story:
      "At height 3,428,143, Ironwood introduces Zcash's next shielded pool.",
    code: "activate(\"NU6.3\", 3428143)\npool = new Ironwood()",
    people: 192,
    commits: 16196,
    ties: 8000,
    accent: "#f4b728",
    logo: "/upgrades/ironwood.png",
    logoStyle: "wide",
    mark: "IW",
    source: "https://zfnd.org/zebra-6-0-0-release/",
  },
];

const MACHINE_FOCUS = [0, 16, 33, 51, 69, 85, 100];

const FINALE_SHARDS = [
  { x: -46, y: -32, r: -42, d: 0 },
  { x: -34, y: -45, r: 18, d: 40 },
  { x: -19, y: -39, r: -16, d: 70 },
  { x: -8, y: -49, r: 38, d: 20 },
  { x: 10, y: -47, r: -28, d: 85 },
  { x: 24, y: -41, r: 22, d: 35 },
  { x: 41, y: -34, r: 48, d: 65 },
  { x: 48, y: -15, r: -12, d: 10 },
  { x: 43, y: 5, r: 35, d: 55 },
  { x: 49, y: 26, r: -31, d: 90 },
  { x: 34, y: 41, r: 15, d: 25 },
  { x: 17, y: 47, r: -44, d: 75 },
  { x: 2, y: 43, r: 26, d: 5 },
  { x: -15, y: 48, r: -18, d: 50 },
  { x: -32, y: 39, r: 42, d: 95 },
  { x: -45, y: 25, r: -26, d: 30 },
  { x: -49, y: 6, r: 13, d: 80 },
  { x: -43, y: -13, r: -36, d: 15 },
] as const;

function formatNumber(value?: number) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((part) => !part.includes("."))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function UpgradeMark({ era }: { era: Era }) {
  if (!era.logo) {
    return (
      <a
        className="upgrade-mark upgrade-mark--learn"
        href={era.source}
        target="_blank"
        rel="noreferrer"
      >
        KNOW MORE ↗
      </a>
    );
  }

  return (
    <a
      className={`upgrade-mark ${era.logo ? "upgrade-mark--official" : "upgrade-mark--seal"} ${era.logoStyle ? `upgrade-mark--${era.logoStyle}` : ""} upgrade-mark--${era.mark.toLowerCase().replace(".", "-")}`}
      href={era.source}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open the source for ${era.chapter}`}
    >
      {era.logo ? <img src={assetPath(era.logo)} alt={`${era.chapter} official emblem`} /> : <span>{era.mark}</span>}
    </a>
  );
}

export default function Home() {
  const [active, setActive] = useState(0);
  const [typedLength, setTypedLength] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(false);
  const [finale, setFinale] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const previousActive = useRef(0);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const era = ERAS[active];
  const fullText = useMemo(() => `${era.story}\n\n${era.code}`, [era]);
  const metrics =
    era.stats ??
    [
      { label: "PEOPLE", value: formatNumber(era.people) },
      { label: "COMMITS", value: formatNumber(era.commits) },
      { label: "LINKS", value: formatNumber(era.ties) },
    ];

  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new AudioContext();
    if (audioRef.current.state === "suspended") await audioRef.current.resume();
    return audioRef.current;
  }, []);

  const playBell = useCallback((context?: AudioContext) => {
    const audio = context ?? audioRef.current;
    if (!audio) return;
    const now = audio.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(index === 0 ? 0.035 : 0.018, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(now + index * 0.035);
      oscillator.stop(now + 0.68);
    });
  }, []);

  const playImpact = useCallback(() => {
    const audio = audioRef.current;
    if (!sound || !audio) return;

    const now = audio.currentTime;
    const duration = 1.25;
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const envelope = Math.pow(1 - index / data.length, 2.4);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }

    const blast = audio.createBufferSource();
    const blastFilter = audio.createBiquadFilter();
    const blastGain = audio.createGain();
    blast.buffer = buffer;
    blastFilter.type = "lowpass";
    blastFilter.frequency.setValueAtTime(620, now);
    blastFilter.frequency.exponentialRampToValueAtTime(90, now + duration);
    blastGain.gain.setValueAtTime(0.42, now);
    blastGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    blast.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(audio.destination);

    const impact = audio.createOscillator();
    const impactGain = audio.createGain();
    impact.type = "sine";
    impact.frequency.setValueAtTime(96, now);
    impact.frequency.exponentialRampToValueAtTime(32, now + 0.72);
    impactGain.gain.setValueAtTime(0.32, now);
    impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
    impact.connect(impactGain);
    impactGain.connect(audio.destination);

    blast.start(now);
    impact.start(now);
    blast.stop(now + duration);
    impact.stop(now + 0.8);
  }, [sound]);

  const playKey = useCallback(
    (character: string) => {
      const audio = audioRef.current;
      if (!sound || !audio) return;
      const now = audio.currentTime;

      if (character === "\n") {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(360, now);
        oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.13);
        gain.gain.setValueAtTime(0.045, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.16);
        return;
      }

      const duration = era.machineIndex < 3 ? 0.034 : 0.022;
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
      }
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = era.machineIndex < 3 ? 1650 : 2450;
      filter.Q.value = 0.8;
      gain.gain.setValueAtTime(era.machineIndex < 3 ? 0.12 : 0.065, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audio.destination);
      source.start(now);
    },
    [era.machineIndex, sound],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setTypedLength(0), 0);
    if (sound && active !== previousActive.current) playBell();
    previousActive.current = active;
    return () => window.clearTimeout(timer);
  }, [active, playBell, sound]);

  useEffect(() => {
    if (finale) playImpact();
  }, [finale, playImpact]);

  useEffect(() => {
    const container = timelineRef.current;
    const item = container?.children[active] as HTMLElement | undefined;
    if (!container || !item) return;
    const left = item.offsetLeft - container.clientWidth / 2 + item.clientWidth / 2;
    container.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
  }, [active, reducedMotion]);

  useEffect(() => {
    if (reducedMotion && typedLength < fullText.length) {
      const timer = window.setTimeout(() => setTypedLength(fullText.length), 0);
      return () => window.clearTimeout(timer);
    }

    if (typedLength < fullText.length) {
      const character = fullText[typedLength];
      const delay = character === "\n" ? 82 : character === "." ? 58 : 14 + Math.random() * 10;
      const timer = window.setTimeout(() => {
        setTypedLength((length) => length + 1);
        playKey(character);
      }, delay);
      return () => window.clearTimeout(timer);
    }

    if (playing && active < ERAS.length - 1) {
      const timer = window.setTimeout(() => setActive((index) => index + 1), 1500);
      return () => window.clearTimeout(timer);
    }

    if (playing && active === ERAS.length - 1) {
      const timer = window.setTimeout(() => {
        setPlaying(false);
        setFinale(true);
      }, 1300);
      return () => window.clearTimeout(timer);
    }
  }, [active, fullText, playKey, playing, reducedMotion, typedLength]);

  const goTo = useCallback((index: number) => {
    setPlaying(false);
    setFinale(false);
    setActive(Math.max(0, Math.min(ERAS.length - 1, index)));
  }, []);

  const togglePlay = () => {
    if (active === ERAS.length - 1 && typedLength >= fullText.length) {
      setPlaying(false);
      setFinale(true);
      return;
    }
    setPlaying((value) => !value);
  };

  const toggleSound = async () => {
    if (sound) {
      setSound(false);
      return;
    }
    const audio = await ensureAudio();
    setSound(true);
    playBell(audio);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (finale) {
        if (event.key === "Escape") setFinale(false);
        return;
      }
      if (event.key === "ArrowRight") goTo(active + 1);
      if (event.key === "ArrowLeft") goTo(active - 1);
      if (event.key === " " && event.target === document.body) {
        event.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const replayFromFinale = () => {
    setFinale(false);
    setActive(0);
    setTypedLength(0);
    setPlaying(true);
  };

  const [typedStory = "", typedCode = ""] = fullText.slice(0, typedLength).split("\n\n");
  const isTyping = typedLength < fullText.length;
  const reverse = era.machineIndex >= 4;
  const progress = (active / (ERAS.length - 1)) * 100;

  return (
    <main
      className={`story-world ${reverse ? "is-reversed" : ""}`}
      style={
        {
          "--accent": era.accent,
          "--machine-focus": `${MACHINE_FOCUS[era.machineIndex]}%`,
          "--machine-image": `url("${assetPath("/machine-evolution.png")}")`,
        } as React.CSSProperties
      }
    >
      <div className="texture" aria-hidden="true" />

      <header className="masthead">
        <a className="zcash-brand" href={assetPath("/")} aria-label="Return to the 2013 beginning">
          <img src={assetPath("/zcash-official-white.svg")} alt="Zcash" />
          <span>
            <b>ZCASH</b>
            <small>ZEROCOIN TO IRONWOOD</small>
          </span>
        </a>

        <div className="masthead-center" aria-label="10 Years">
          <b>10</b>
          <span>YEARS</span>
        </div>

        <div className="masthead-actions">
          <button className={`sound-control ${sound ? "is-on" : ""}`} onClick={toggleSound}>
            <span className="sound-bars" aria-hidden="true"><i /><i /><i /></span>
            {sound ? "SOUND ON" : "SOUND OFF"}
          </button>
          <button className="play-control" onClick={togglePlay}>
            <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
            {playing ? "PAUSE" : active === ERAS.length - 1 ? "FINALE" : "PLAY"}
          </button>
        </div>
      </header>

      <section className="cinematic-stage">
        <div className="machine-panorama" aria-hidden="true" />
        <div className="stage-vignette" aria-hidden="true" />

        <div className="chapter-copy" key={`copy-${active}`}>
          <p className="chapter-kicker">{era.kicker}</p>
          <div className="year-lockup">
            <span>{era.year}</span>
            <i />
          </div>
          <h1>{era.chapter}</h1>
          <p className="chapter-date">{era.date}</p>

          <dl className="chapter-stats">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd
                  className={
                    /^[\d<]/.test(metric.value)
                      ? "is-number"
                      : metric.value.length > 10
                        ? "is-compact"
                        : undefined
                  }
                >
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <article
          className={`script-sheet ${isTyping ? "is-typing" : ""} ${era.figures ? "has-figures" : ""} ${(era.figures?.length ?? 0) > 4 ? "figures-dense" : ""} ${era.cardArt ? "has-card-art" : ""} ${era.cardArtTone ? `card-art--${era.cardArtTone}` : ""} ${era.surface ? `surface-${era.surface}` : ""}`}
          style={era.cardArt ? ({ "--card-art": `url("${assetPath(era.cardArt)}")` } as CSSProperties) : undefined}
          key={`sheet-${active}`}
        >
          {(era.surface === "agent" || era.surface === "cli") && (
            <div className="cli-agent-bar" aria-hidden="true">
              <span><i />{era.surface === "cli" ? "CODEX AGENT MESH" : "AGENT PREVIEW"}</span>
              <span>{era.surface === "cli" ? "03 AGENTS ONLINE" : "01 AGENT ONLINE"}</span>
            </div>
          )}
          <div className="sheet-header">
            <span>
              {era.phase ?? "ZCASH"} / {String(active + 1).padStart(2, "0")}
              {era.surface ? ` · ${SURFACE_LABELS[era.surface]}` : ""}
            </span>
            <span>{era.date}</span>
          </div>
          <UpgradeMark era={era} />
          <div className="sheet-title">
            <small>{era.kicker}</small>
            <h2>{era.chapter}</h2>
          </div>
          {era.figures && (
            <div className="figure-dossier" aria-label="Key figures">
              <span className="figure-dossier__label">KEY FIGURES</span>
              <ul>
                {era.figures.map((figure) => (
                  <li key={`${figure.name}-${figure.role}`}>
                    <span className="figure-monogram" aria-hidden="true">{initials(figure.name)}</span>
                    <span>
                      <b>{figure.name}</b>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="typed-story">{typedStory}</p>
          <pre className="typed-code">
            {era.surface === "cli" && <span className="cli-prompt">codex@zcash:~/ironwood$ </span>}
            {era.surface === "agent" && <span className="cli-prompt">agent@zebra:~$ </span>}
            {typedCode}
            {isTyping && <span className="caret" aria-hidden="true" />}
          </pre>
          {era.phase !== "ORIGINS" && (
            <a className="source-link" href={era.source} target="_blank" rel="noreferrer">
              SOURCE ↗
            </a>
          )}
        </article>

        <div className="instrument-label">
          <span>ACTIVE INSTRUMENT</span>
          <b>{era.machine}</b>
        </div>
      </section>

      <nav className="timeline" aria-label="The history of private digital money and Zcash">
        <div className="timeline-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="timeline-scroll" ref={timelineRef}>
          {ERAS.map((item, index) => (
            <button
              key={`${item.chapter}-${item.date}`}
              className={`${index === active ? "is-active" : ""} ${index < active ? "is-past" : ""}`}
              onClick={() => goTo(index)}
              aria-current={index === active ? "step" : undefined}
            >
              <span className="timeline-dot" />
              <b>{item.year}</b>
              <small>{item.chapter}</small>
            </button>
          ))}
        </div>
      </nav>

      {finale && (
        <section
          className="finale"
          role="dialog"
          aria-modal="true"
          aria-label="Ironwood network upgrade finale"
        >
          <div className="finale-art">
            <img className="finale-art__main" src={assetPath("/ironwood-finale.png")} alt="Zcash Network Update Ironwood" />
            <img className="finale-art__slice finale-art__slice--one" src={assetPath("/ironwood-finale.png")} alt="" aria-hidden="true" />
            <img className="finale-art__slice finale-art__slice--two" src={assetPath("/ironwood-finale.png")} alt="" aria-hidden="true" />
          </div>
          <div className="finale-burst" aria-hidden="true" />
          <div className="finale-shards" aria-hidden="true">
            {FINALE_SHARDS.map((shard, index) => (
              <i
                key={`${shard.x}-${shard.y}`}
                style={
                  {
                    "--shard-x": `${shard.x}vw`,
                    "--shard-y": `${shard.y}vh`,
                    "--shard-r": `${shard.r}deg`,
                    "--shard-delay": `${shard.d}ms`,
                    "--shard-index": index,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <div className="finale-curtain finale-curtain--left" aria-hidden="true" />
          <div className="finale-curtain finale-curtain--right" aria-hidden="true" />
          <div className="finale-flash" aria-hidden="true" />
          <div className="finale-controls">
            <span>JULY 28, 2026</span>
            <button onClick={() => setFinale(false)}>RETURN TO 2026</button>
            <button className="finale-replay" onClick={replayFromFinale}>REPLAY ARCHIVE</button>
          </div>
        </section>
      )}

    </main>
  );
}
