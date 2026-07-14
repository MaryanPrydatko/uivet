import type { Scenario } from "../src/types.ts";

// Fixed leaderboard scenarios. The first three are copied verbatim from
// examples/uivet.config.ts so the benchmark is self-contained and stable: it
// must not silently change when the demo config is edited. The last two are
// harder: pricing-table stresses fidelity (12 rows, every cell must render),
// settings-form stresses a11y label coverage (many labeled form controls).
// Every value in `data` is visible page text so the deterministic fidelity
// check is strict but fair (no placeholder-only or attribute-only values).
export const SCENARIOS: Scenario[] = [
  {
    data: {
      flights: [
        {
          airline: "SWISS",
          arrival: "08:25",
          departure: "18:40",
          duration: "7h 45m",
          price: "$1,248",
          stops: "Nonstop",
        },
        {
          airline: "Lufthansa",
          arrival: "09:55",
          departure: "16:10",
          duration: "9h 45m",
          price: "$1,092",
          stops: "1 stop (FRA)",
        },
        {
          airline: "United",
          arrival: "14:20",
          departure: "21:30",
          duration: "10h 50m",
          price: "$986",
          stops: "1 stop (EWR)",
        },
        {
          airline: "Air France",
          arrival: "11:40",
          departure: "17:05",
          duration: "11h 35m",
          price: "$1,415",
          stops: "1 stop (CDG)",
        },
      ],
      route: "New York (JFK) to Zürich (ZRH)",
    },
    id: "flight-results",
    prompt:
      "A flight search results page listing the flights below. Show airline, departure and arrival times, duration, stops, and price for each, with a clear way to compare and select.",
    runs: 3,
  },
  {
    data: {
      categories: ["Travel", "Meals", "Software", "Office supplies", "Other"],
      policyNote:
        "Expenses over $75 require an itemized receipt and are reimbursed within 14 business days.",
    },
    id: "expense-form",
    prompt:
      "An expense submission form with amount, date, a category dropdown, a description field, a receipt upload, and a submit button. Render the policy note verbatim near the submit button.",
    runs: 3,
  },
  {
    data: {
      metrics: [
        { label: "Weekly active users", value: "48,210", wow: "+6.4%" },
        { label: "Activation rate", value: "31.2%", wow: "-1.1%" },
        {
          label: "Average revenue per paying user",
          value: "$27.90",
          wow: "+2.3%",
        },
        { label: "D7 retention", value: "42.8%", wow: "+0.9%" },
        {
          label: "Support tickets per 1,000 sessions",
          value: "3.7",
          wow: "-0.5%",
        },
        { label: "Median time to first value", value: "94 s", wow: "-8.0%" },
      ],
    },
    id: "metrics-dashboard",
    prompt:
      "A product metrics dashboard showing the six metrics below as cards, each with its value and week-over-week change. Keep long labels readable without breaking the layout.",
    runs: 3,
  },
  {
    data: {
      caption: "On-demand Linux pricing, US East (N. Virginia)",
      instances: [
        {
          memory: "0.5 GiB",
          monthly: "$3.07",
          name: "t4g.nano",
          rate: "$0.0042",
          storage: "EBS only",
          vcpus: 2,
        },
        {
          memory: "1 GiB",
          monthly: "$6.13",
          name: "t4g.micro",
          rate: "$0.0084",
          storage: "EBS only",
          vcpus: 2,
        },
        {
          memory: "2 GiB",
          monthly: "$12.26",
          name: "t4g.small",
          rate: "$0.0168",
          storage: "EBS only",
          vcpus: 2,
        },
        {
          memory: "4 GiB",
          monthly: "$24.53",
          name: "t4g.medium",
          rate: "$0.0336",
          storage: "EBS only",
          vcpus: 2,
        },
        {
          memory: "8 GiB",
          monthly: "$59.57",
          name: "m7g.large",
          rate: "$0.0816",
          storage: "EBS only",
          vcpus: 2,
        },
        {
          memory: "16 GiB",
          monthly: "$119.14",
          name: "m7g.xlarge",
          rate: "$0.1632",
          storage: "EBS only",
          vcpus: 4,
        },
        {
          memory: "16 GiB",
          monthly: "$211.70",
          name: "c7g.2xlarge",
          rate: "$0.2900",
          storage: "EBS only",
          vcpus: 8,
        },
        {
          memory: "64 GiB",
          monthly: "$312.73",
          name: "r7g.2xlarge",
          rate: "$0.4284",
          storage: "EBS only",
          vcpus: 8,
        },
        {
          memory: "64 GiB",
          monthly: "$476.54",
          name: "m7g.4xlarge",
          rate: "$0.6528",
          storage: "EBS only",
          vcpus: 16,
        },
        {
          memory: "64 GiB",
          monthly: "$846.80",
          name: "c7g.8xlarge",
          rate: "$1.1600",
          storage: "900 GB NVMe",
          vcpus: 32,
        },
        {
          memory: "256 GiB",
          monthly: "$1,250.93",
          name: "r7g.8xlarge",
          rate: "$1.7136",
          storage: "1,900 GB NVMe",
          vcpus: 32,
        },
        {
          memory: "256 GiB",
          monthly: "$1,906.18",
          name: "m7g.16xlarge",
          rate: "$2.6112",
          storage: "3,800 GB NVMe",
          vcpus: 64,
        },
      ],
      note: "Prices exclude tax. Monthly estimate assumes 730 hours of usage.",
    },
    id: "pricing-table",
    prompt:
      "A pricing comparison table for the 12 cloud compute instances below. Render every column for all rows (instance name, vCPUs, memory, storage, hourly rate, monthly estimate) in a single readable table, with the caption above it and the note below it. Show every value exactly as given.",
    runs: 3,
  },
  {
    data: {
      fields: [
        { help: "Shown on your public profile", label: "Display name" },
        {
          help: "We only use this for security alerts",
          label: "Contact email",
        },
      ],
      saveButton: "Save changes",
      themeHelp: "Applies across all of your devices",
      themeLabel: "Theme",
      themeOptions: ["Light", "Dark", "System"],
      timeoutHelp: "Automatically sign out after 30 minutes of inactivity",
      timeoutLabel: "Session timeout",
      title: "Account settings",
      toggles: [
        {
          help: "Requires an authenticator app",
          label: "Enable two-factor authentication",
        },
        {
          help: "A summary of new features every Monday",
          label: "Send weekly product digest",
        },
      ],
    },
    id: "settings-form",
    prompt:
      "An account settings form titled 'Account settings'. Include a labeled text input for each field with its helper text, a theme selector offering the three options, a labeled control for the session timeout with its helper text, and a labeled toggle for each item with its helper text, plus a save button. Every control must have a visible, programmatically associated label. Render all labels, options, and helper text exactly as given.",
    runs: 3,
  },
];
