export interface FixtureLens {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  siteName: string;
  author: string;
  publishedAt: string;
  language: string;
  excerpt: string;
  wordCount: number;
  readingMinutes: number;
  summary: string[];
  model: string;
  claims: Array<{
    id: string;
    position: number;
    text: string;
    sourceQuote: string;
  }>;
  perspectives: Array<{
    id: string;
    position: number;
    slug: string;
    label: string;
    kind: "ideological" | "stakeholder" | "skeptic" | "local" | "historical";
    colorKey: 0 | 1 | 2 | 3 | 4 | 5;
    stance: string;
    thought: string;
    claimIds: string[];
  }>;
}

export const FEATURED_LENSES: FixtureLens[] = [
  {
    id: "energy-grid-2026",
    url: "https://energytimes.example.com/clean-transition-grid-reliability",
    canonicalUrl: "https://energytimes.example.com/clean-transition-grid-reliability",
    title: "National Grid Operators Face Rising Costs and Balancing Challenges in Renewable Push",
    siteName: "Energy Times",
    author: "Elena Rostova",
    publishedAt: "2026-10-15T08:30:00.000Z",
    language: "en",
    excerpt: "Grid operators are contending with intermittent renewable generation, aging transmission lines, and multi-billion-dollar upgrades required to maintain continuous baseload power.",
    wordCount: 1420,
    readingMinutes: 7,
    summary: [
      "Federal clean energy standards require forty percent of transmission grid capacity to transition to zero-carbon sources by 2030.",
      "Independent grid monitors project regional capacity shortfall risks during peak winter demand spikes.",
      "Utility operators estimate system reliability upgrades will require ninety billion dollars in regional transmission investments.",
    ],
    model: "claude-sonnet-5-5",
    claims: [
      {
        id: "claim-eg-1",
        position: 1,
        text: "Federal mandates require forty percent of transmission grid power to come from renewables by 2030.",
        sourceQuote: "Federal clean energy standards require forty percent of transmission grid capacity to transition to zero-carbon sources by 2030.",
      },
      {
        id: "claim-eg-2",
        position: 2,
        text: "Independent grid monitors project elevated shortfall risks during severe cold weather periods.",
        sourceQuote: "Independent grid monitors project regional capacity shortfall risks during peak winter demand spikes.",
      },
      {
        id: "claim-eg-3",
        position: 3,
        text: "Upgrading transmission infrastructure is projected to require ninety billion dollars.",
        sourceQuote: "Utility operators estimate system reliability upgrades will require ninety billion dollars in regional transmission investments.",
      },
      {
        id: "claim-eg-4",
        position: 4,
        text: "Battery storage installations expanded by sixty-two percent over the preceding twelve months.",
        sourceQuote: "Commercial battery storage capacity grew by sixty-two percent across regional interconnections last year.",
      },
    ],
    perspectives: [
      {
        id: "p-eg-1",
        position: 1,
        slug: "market-liberal",
        label: "Market-Liberal",
        kind: "ideological",
        colorKey: 0,
        stance: "Prioritizes wholesale market pricing signals and private battery storage capital over rigid administrative mandates.",
        thought: "Dynamic wholesale pricing incentivizes private storage deployment without overburdening public balance sheets. Let price signals guide where batteries and generation connect rather than top-down federal decrees.",
        claimIds: ["claim-eg-1", "claim-eg-4"],
      },
      {
        id: "p-eg-2",
        position: 2,
        slug: "labor-rights",
        label: "Labor & Industry",
        kind: "stakeholder",
        colorKey: 1,
        stance: "Advocates for grid union jobs and steady baseload capacity to preserve domestic manufacturing vitality.",
        thought: "Heavy industrial facilities and manufacturing workers depend on non-negotiable baseload reliability. Transition investments must protect high-wage utility workforce standards and guard against factory curtailments during freezes.",
        claimIds: ["claim-eg-2", "claim-eg-3"],
      },
      {
        id: "p-eg-3",
        position: 3,
        slug: "grid-reliability",
        label: "Engineering Skeptic",
        kind: "skeptic",
        colorKey: 2,
        stance: "Emphasizes rotational inertia and physical constraints over ambitious political milestone schedules.",
        thought: "Battery duration curves cannot yet replace thermal inertia during multi-day calm freezes. Accelerating retirements before transmission corridors are built creates catastrophic black-sky vulnerability.",
        claimIds: ["claim-eg-2", "claim-eg-3"],
      },
      {
        id: "p-eg-4",
        position: 4,
        slug: "ratepayer-advocate",
        label: "Municipal Consumer",
        kind: "local",
        colorKey: 3,
        stance: "Protects low- and middle-income households from escalating monthly utility tariff rate hikes.",
        thought: "A ninety billion dollar capital expenditure will be passed directly into residential electric bills. Without strict consumer rate caps, working families will bear the financial brunt of system overhauls.",
        claimIds: ["claim-eg-3"],
      },
      {
        id: "p-eg-5",
        position: 5,
        slug: "climate-legacy",
        label: "Ecological Transition",
        kind: "historical",
        colorKey: 4,
        stance: "Frames modernization against the compounding systemic costs of delayed carbon abatement.",
        thought: "Every decade of delayed grid overhaul compounds severe climate damage costs that far exceed upfront transmission bonds. Modernizing infrastructure is both an ecological imperative and long-overdue asset renewal.",
        claimIds: ["claim-eg-1", "claim-eg-4"],
      },
    ],
  },
  {
    id: "health-ai-2026",
    url: "https://medtechreview.example.com/autonomous-clinical-diagnostics-oversight",
    canonicalUrl: "https://medtechreview.example.com/autonomous-clinical-diagnostics-oversight",
    title: "Hospitals Adopt Autonomous Diagnostic Scanners Amid Deepening Liability Questions",
    siteName: "MedTech Review",
    author: "Dr. Marcus Vance",
    publishedAt: "2026-10-18T14:15:00.000Z",
    language: "en",
    excerpt: "Machine learning diagnostic systems now read acute radiology scans without mandatory radiologist pre-clearance, speeding triage times while raising complex medical liability precedents.",
    wordCount: 1680,
    readingMinutes: 8,
    summary: [
      "Autonomous AI imaging algorithms achieved ninety-six percent diagnostic concordance with senior board-certified radiologists.",
      "Emergency room scan turnaround times dropped from fifty-four minutes to under six minutes across participating trauma centers.",
      "Malpractice underwriters currently lack standardized tort liability guidelines when algorithmic diagnostics fail.",
    ],
    model: "claude-sonnet-5-5",
    claims: [
      {
        id: "claim-ha-1",
        position: 1,
        text: "Diagnostic algorithms matched senior radiologist accuracy across ninety-six percent of reviewed emergency scans.",
        sourceQuote: "Autonomous AI imaging algorithms achieved ninety-six percent diagnostic concordance with senior board-certified radiologists.",
      },
      {
        id: "claim-ha-2",
        position: 2,
        text: "Average diagnostic turnaround dropped from nearly an hour to under six minutes.",
        sourceQuote: "Emergency room scan turnaround times dropped from fifty-four minutes to under six minutes across participating trauma centers.",
      },
      {
        id: "claim-ha-3",
        position: 3,
        text: "Malpractice insurers have not established who bears legal fault when AI models miss critical findings.",
        sourceQuote: "Malpractice underwriters currently lack standardized tort liability guidelines when algorithmic diagnostics fail.",
      },
      {
        id: "claim-ha-4",
        position: 4,
        text: "Over forty rural hospitals deployed the software due to severe regional radiologist shortages.",
        sourceQuote: "More than forty critical-access hospitals instituted automated imaging to address acute specialist shortages.",
      },
    ],
    perspectives: [
      {
        id: "p-ha-1",
        position: 1,
        slug: "clinical-urgency",
        label: "Emergency Medicine",
        kind: "stakeholder",
        colorKey: 1,
        stance: "Prioritizes immediate life-saving intervention and rapid trauma triage over bureaucratic hesitation.",
        thought: "In ischemic strokes or cerebral hemorrhages, every minute of diagnostic delay destroys brain tissue. Shifting triage from fifty-four minutes to six minutes directly preserves human lives and functional recovery.",
        claimIds: ["claim-ha-2", "claim-ha-4"],
      },
      {
        id: "p-ha-2",
        position: 2,
        slug: "legal-accountability",
        label: "Legal Accountability",
        kind: "skeptic",
        colorKey: 2,
        stance: "Warns against diffusing physician malpractice liability onto opaque proprietary software models.",
        thought: "When a scanner produces a false negative, injured patients face an insurmountable legal void between software vendors and hospitals. Clear civil liability must precede autonomous clinical authority.",
        claimIds: ["claim-ha-3"],
      },
      {
        id: "p-ha-3",
        position: 3,
        slug: "rural-access",
        label: "Rural Health Equity",
        kind: "local",
        colorKey: 3,
        stance: "Emphasizes geographic healthcare access for underserved regional communities lacking round-the-clock specialists.",
        thought: "Rural trauma clinics cannot afford full-time night radiologists. Denying algorithmic screening means transferring patients hundreds of miles for basic triage, causing avoidable mortalities.",
        claimIds: ["claim-ha-4"],
      },
      {
        id: "p-ha-4",
        position: 4,
        slug: "physician-oversight",
        label: "Professional Autonomy",
        kind: "ideological",
        colorKey: 0,
        stance: "Insists upon clinician-in-the-loop validation to maintain physician accountability and bedside trust.",
        thought: "Algorithmic concordance in controlled studies does not equate to holistic clinical bedside context. Tools should augment physician expertise rather than supplant human clinical responsibility.",
        claimIds: ["claim-ha-1", "claim-ha-3"],
      },
      {
        id: "p-ha-5",
        position: 5,
        slug: "health-economics",
        label: "Institutional Pragmatist",
        kind: "historical",
        colorKey: 5,
        stance: "Focuses on bending hospital operational cost curves while handling skyrocketing chronic scan volumes.",
        thought: "Aging demographics are multiplying scan volumes faster than medical schools can graduate specialists. Automation is the only viable path to contain runaway diagnostic costs across healthcare systems.",
        claimIds: ["claim-ha-1", "claim-ha-2"],
      },
    ],
  },
  {
    id: "housing-zoning-2026",
    url: "https://metropolisjournal.example.com/state-preemption-municipal-zoning",
    canonicalUrl: "https://metropolisjournal.example.com/state-preemption-municipal-zoning",
    title: "Statewide Upzoning Laws Prompt Fierce Clashes Over Density, Affordability, and Local Control",
    siteName: "Metropolis Journal",
    author: "Jordan Chen",
    publishedAt: "2026-10-22T11:00:00.000Z",
    language: "en",
    excerpt: "New state legislation preempting single-family residential zoning to allow fourplexes and courtyard apartments has spurred intense debates between pro-housing advocates and municipal preservationists.",
    wordCount: 1530,
    readingMinutes: 7,
    summary: [
      "State legislation overrides local residential zoning bans to permit missing-middle housing within half a mile of transit hubs.",
      "Independent housing economists estimate statewide housing production could increase by twenty-eight thousand units annually.",
      "Municipal associations filed federal injunctions citing water infrastructure strain and historic neighborhood character degradation.",
    ],
    model: "claude-sonnet-5-5",
    claims: [
      {
        id: "claim-hz-1",
        position: 1,
        text: "State law now permits up to four housing units on parcels previously restricted to single-family homes near transit.",
        sourceQuote: "State legislation overrides local residential zoning bans to permit missing-middle housing within half a mile of transit hubs.",
      },
      {
        id: "claim-hz-2",
        position: 2,
        text: "Economists forecast production gains of twenty-eight thousand new homes each year.",
        sourceQuote: "Independent housing economists estimate statewide housing production could increase by twenty-eight thousand units annually.",
      },
      {
        id: "claim-hz-3",
        position: 3,
        text: "Municipal groups challenged the state mandate over storm runoff and infrastructure capacities.",
        sourceQuote: "Municipal associations filed federal injunctions citing water infrastructure strain and historic neighborhood character degradation.",
      },
      {
        id: "claim-hz-4",
        position: 4,
        text: "Median home purchase prices in the state escalated fifty-six percent faster than median household wages over the decade.",
        sourceQuote: "Statewide home purchase prices expanded fifty-six percent beyond median wage growth over the past ten years.",
      },
    ],
    perspectives: [
      {
        id: "p-hz-1",
        position: 1,
        slug: "housing-abundancist",
        label: "Supply & Abundance",
        kind: "ideological",
        colorKey: 0,
        stance: "Advocates legalizing dense market-rate construction to halt escalating housing costs and intergenerational exclusion.",
        thought: "Decades of exclusionary zoning created an artificial housing scarcity that prices out young families and essential workers. Legalizing missing-middle density near transit is the primary engine of affordability.",
        claimIds: ["claim-hz-1", "claim-hz-2", "claim-hz-4"],
      },
      {
        id: "p-hz-2",
        position: 2,
        slug: "neighborhood-defender",
        label: "Municipal Preservation",
        kind: "local",
        colorKey: 3,
        stance: "Defends grassroots municipal self-governance, architectural heritage, and canopy preservation against developer windfall profits.",
        thought: "Neighborhood zoning was established through democratic municipal charters. Sweeping top-down state preemption undermines local planning, strains aging sewage mains, and strips tree canopies.",
        claimIds: ["claim-hz-1", "claim-hz-3"],
      },
      {
        id: "p-hz-3",
        position: 3,
        slug: "infrastructure-auditor",
        label: "Public Works Skeptic",
        kind: "skeptic",
        colorKey: 2,
        stance: "Warns that adding housing without concurrent storm runoff and school funding creates municipal distress.",
        thought: "Density without capital funding for stormwater retention, electrical feeder upgrades, and public school seats results in infrastructure failures. Growth mandates must include state infrastructure co-investment.",
        claimIds: ["claim-hz-2", "claim-hz-3"],
      },
      {
        id: "p-hz-4",
        position: 4,
        slug: "equity-coalition",
        label: "Tenant & Anti-Displacement",
        kind: "stakeholder",
        colorKey: 1,
        stance: "Demands binding deed-restricted affordable quotas to prevent speculative luxury gentrification.",
        thought: "Unrestricted market upzoning often incentivizes teardowns of naturally occurring affordable duplexes. Without enforceable affordability quotas and tenant protections, density increases displacement.",
        claimIds: ["claim-hz-1", "claim-hz-4"],
      },
      {
        id: "p-hz-5",
        position: 5,
        slug: "transit-sustainability",
        label: "Climate Urbanist",
        kind: "historical",
        colorKey: 4,
        stance: "Views compact urbanism as vital for reducing automobile vehicle-miles-traveled and carbon footprints.",
        thought: "Suburban sprawl consumes agricultural land and forces hours of car commutes. Clustering homes around rail corridors represents the single most impactful structural climate action a state can enact.",
        claimIds: ["claim-hz-1", "claim-hz-2"],
      },
    ],
  },
];

