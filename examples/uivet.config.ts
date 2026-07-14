import type { UivetConfig } from "../src/types.ts"

const config: UivetConfig = {
  scenarios: [
    {
      id: "flight-results",
      prompt:
        "A flight search results page listing the flights below. Show airline, departure and arrival times, duration, stops, and price for each, with a clear way to compare and select.",
      runs: 3,
      data: {
        route: "New York (JFK) to Zürich (ZRH)",
        flights: [
          {
            airline: "SWISS",
            departure: "18:40",
            arrival: "08:25",
            duration: "7h 45m",
            stops: "Nonstop",
            price: "$1,248",
          },
          {
            airline: "Lufthansa",
            departure: "16:10",
            arrival: "09:55",
            duration: "9h 45m",
            stops: "1 stop (FRA)",
            price: "$1,092",
          },
          {
            airline: "United",
            departure: "21:30",
            arrival: "14:20",
            duration: "10h 50m",
            stops: "1 stop (EWR)",
            price: "$986",
          },
          {
            airline: "Air France",
            departure: "17:05",
            arrival: "11:40",
            duration: "11h 35m",
            stops: "1 stop (CDG)",
            price: "$1,415",
          },
        ],
      },
    },
    {
      id: "expense-form",
      prompt:
        "An expense submission form with amount, date, a category dropdown, a description field, a receipt upload, and a submit button. Render the policy note verbatim near the submit button.",
      runs: 3,
      data: {
        categories: ["Travel", "Meals", "Software", "Office supplies", "Other"],
        policyNote:
          "Expenses over $75 require an itemized receipt and are reimbursed within 14 business days.",
      },
    },
    {
      id: "metrics-dashboard",
      prompt:
        "A product metrics dashboard showing the six metrics below as cards, each with its value and week-over-week change. Keep long labels readable without breaking the layout.",
      runs: 3,
      data: {
        metrics: [
          { label: "Weekly active users", value: "48,210", wow: "+6.4%" },
          { label: "Activation rate", value: "31.2%", wow: "-1.1%" },
          { label: "Average revenue per paying user", value: "$27.90", wow: "+2.3%" },
          { label: "D7 retention", value: "42.8%", wow: "+0.9%" },
          { label: "Support tickets per 1,000 sessions", value: "3.7", wow: "-0.5%" },
          { label: "Median time to first value", value: "94 s", wow: "-8.0%" },
        ],
      },
    },
  ],
}

export default config
