export interface ChapterEvent {
  kind: string;
  cls: "tag-neutral" | "tag-outline";
  text: string;
}

export interface Chapter {
  date: string;
  cap: string;
  prose: string[];
  events: ChapterEvent[];
}

/** Editorial narrative, one per checkpoint, aligned by index to the real
 * `milestones` array in the graph data. This is hand-authored commentary
 * accompanying the real computed graph, not a substitute for it: the graph
 * itself (node positions, degree, community, commit counts) always comes
 * from the pipeline's output. */
export const CHAPTERS: Chapter[] = [
  {
    date: "18 May 2014",
    cap: "Four cryptographers and a paper. The whole network fits at one table.",
    prose: [
      "The Zerocash paper is published, and the network that will become Zcash is a handful of authors passing drafts. Every edge in the graph is a personal acquaintance.",
    ],
    events: [
      { kind: "Formed", cls: "tag-neutral", text: "The founding community gathers, five people around one paper." },
    ],
  },
  {
    date: "28 October 2016",
    cap: "The paper becomes a product. Engineers join the cryptographers.",
    prose: [
      "Sprout launches on mainnet. The graph doubles in a year: the cryptographers are joined by the engineers who must keep a real network alive, and zcashd becomes the center of gravity.",
    ],
    events: [
      { kind: "Formed", cls: "tag-neutral", text: "A zcashd engineering community forms around the launch." },
      { kind: "Continued", cls: "tag-neutral", text: "The founding core continues, now writing consensus code rather than proofs." },
    ],
  },
  {
    date: "26 June 2018",
    cap: "The first upgrade. The network learns to change itself.",
    prose: [
      "Overwinter proves the protocol can upgrade in place. The commit record shows a new discipline: specification work in zips, implementation in zcashd, and the first sustained audit activity.",
    ],
    events: [
      { kind: "Formed", cls: "tag-neutral", text: "An audits and tooling community appears at the edge of the graph." },
    ],
  },
  {
    date: "28 October 2018",
    cap: "Sixty three people. The founders' single bench parts into protocol and wallet work.",
    prose: [
      "Sapling is the largest cryptographic change the project will ever ship. The network splits visibly: a protocol bench around librustzcash, a product bench around zcashd and the wallets.",
    ],
    events: [{ kind: "Split", cls: "tag-outline", text: "Protocol and product part into distinct communities." }],
  },
  {
    date: "11 December 2019",
    cap: "A quieter year. The network consolidates around what shipped.",
    prose: [
      "Blossom is a small upgrade, and the graph shows a project catching its breath: fewer new arrivals, denser ties among those who stayed.",
    ],
    events: [{ kind: "Continued", cls: "tag-neutral", text: "All three communities continue with little turnover." }],
  },
  {
    date: "16 July 2020",
    cap: "A second implementation begins. Zebra opens a new room.",
    prose: [
      "Heartwood lands, and in the same season the Zebra effort, an independent consensus implementation in Rust, begins in earnest. A new cluster forms, seeded by cryptographers from outside the founding cohort.",
    ],
    events: [{ kind: "Formed", cls: "tag-neutral", text: "The Zebra community forms, a second implementation, a second room." }],
  },
  {
    date: "18 November 2020",
    cap: "Two implementations, one protocol. The carriers appear.",
    prose: [
      "Canopy activates. The interesting people now are the ones with edges into both rooms: the carriers who keep zcashd and Zebra describing the same protocol.",
    ],
    events: [
      { kind: "Continued", cls: "tag-neutral", text: "Betweenness concentrates in the few people bridging the two implementations." },
    ],
  },
  {
    date: "31 May 2022",
    cap: "Orchard arrives. The benches are distinct rooms now.",
    prose: [
      "Orchard arrives after four years of preparation, and the network shows it: the zcashd bench and the Zebra bench are distinct rooms, joined by the few people who carry work between them.",
      "The causal record shows the handoffs ran through three people, not the dozen a static reading of the same graph suggests.",
    ],
    events: [
      { kind: "Split", cls: "tag-outline", text: "The wallet developers part from the zcashd core." },
      { kind: "Formed", cls: "tag-neutral", text: "A wallet tooling community gathers around the light clients." },
    ],
  },
  {
    date: "23 November 2024",
    cap: "A generational turn. New names carry most of the commits.",
    prose: [
      "By NU6 most of the founding cohort has stepped back. The densest activity belongs to people who joined after Sapling: the project has survived its first full change of hands.",
    ],
    events: [
      { kind: "Merged", cls: "tag-outline", text: "Wallet tooling and the light client work merge into one community." },
      { kind: "Dissolved", cls: "tag-neutral", text: "The original audit cluster disperses into the implementation teams." },
    ],
  },
  {
    date: "30 June 2025",
    cap: "Maintenance as a way of life. The graph is steady state.",
    prose: [
      "NU6.1 is a maintenance upgrade and the network looks like one: stable clusters, low churn, and a long tail of occasional contributors around a compact core.",
    ],
    events: [
      { kind: "Continued", cls: "tag-neutral", text: "Every community continues; median tenure in the core passes six years." },
    ],
  },
  {
    date: "23 July 2026",
    cap: "The present. Ironwood is five days out.",
    prose: [
      "Nothing has shipped yet for Ironwood, so the network here still holds NU6.1's shape exactly: the same clusters, the same core. This checkpoint is the honest present, not a preview of what's coming.",
    ],
    events: [{ kind: "Continued", cls: "tag-neutral", text: "The network holds steady while the next upgrade approaches." }],
  },
  {
    date: "28 July 2026",
    cap: "Ten years in. A network with real depth, one protocol.",
    prose: [
      "Ironwood activates a decade after the paper. The network holds its communities and the accumulated shape of every merge and split before them: the org chart the project drew for itself, one commit at a time.",
    ],
    events: [{ kind: "Continued", cls: "tag-neutral", text: "The decade closes with the network at its widest and calmest." }],
  },
];

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
