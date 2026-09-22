import { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type HealthResponse = {
  status: string;
};

export function App() {
  const [health, setHealth] = useState("checking");

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/health`)
      .then((response) => response.json() as Promise<HealthResponse>)
      .then((data) => setHealth(data.status))
      .catch(() => setHealth("unreachable"));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 680, margin: "2rem auto" }}>
      <h1>Family Butler</h1>
      <p>React frontend connected to API backend.</p>
      <p>
        API health: <strong>{health}</strong>
      </p>
    </main>
  );
}
