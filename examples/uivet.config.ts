import type { UivetConfig } from "../src/types.ts";

const config: UivetConfig = {
  scenarios: [
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
  ],
};

export default config;
