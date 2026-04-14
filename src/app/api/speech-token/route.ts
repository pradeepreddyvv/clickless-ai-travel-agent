import { NextResponse } from "next/server";

// Returns a short-lived Speechmatics JWT so the API key never reaches the browser.
export async function POST() {
  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Speechmatics API key not configured" }, { status: 500 });
  }

  const res = await fetch("https://mp.speechmatics.com/v1/api_keys?type=rt", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl: 60 }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Speechmatics token error: ${text}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({ token: data.key_value });
}
