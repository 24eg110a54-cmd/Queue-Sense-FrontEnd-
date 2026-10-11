import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, deviceHash } from "./api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEVEL_TEXT = { low: "Quiet", medium: "Getting busy", high: "Packed" };
const TREND = { rising: "filling up", falling: "emptying", steady: "steady" };

function useLive() {
  const [venues, setVenues] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api(`/venues/live?device_hash=${deviceHash()}`).then((v) => { setVenues(v); setError(""); })
      .catch(() => setError("Can't reach the server. Check that the backend is running."));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  return { venues, error, reload: load };
}

function Live({ venues, error, reload }) {
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(null);
  const [name, setName] = useState(localStorage.getItem("qs_name") || "");
  const [hours, setHours] = useState(1);
  const post = async (path, body, ok) => {
    try {
      await api(path, { method: "POST", body: JSON.stringify({ device_hash: deviceHash(), ...body }) });
      setMsg(ok); setForm(null); reload();
    } catch (e) { setMsg(e.message); }
  };
  const confirm = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setMsg("Enter your name to check in.");
    localStorage.setItem("qs_name", n);
    post("/checkin", { venue_id: form.id, name: n, hours: +hours }, `Welcome, ${n}. You're checked in to ${form.name} for ${hours} h.`);
  };
  if (error) return <p className="note err">{error}</p>;
  if (!venues) return <p className="note">Loading live crowd levels…</p>;
  return (
    <>
      {msg && <p className="note" role="status">{msg}</p>}
      <div className="grid">
        {venues.map((v) => (
          <article key={v.id} className={`card ${v.level}`}>
            <h2>{v.name}</h2>
            <div className="pct">{Math.min(v.percent, 100)}<small>% full</small></div>
            <div className="bar"><i style={{ width: `${Math.min(v.percent, 100)}%` }} /></div>
            <p className="meta"><b>{LEVEL_TEXT[v.level]}</b>, {TREND[v.trend]}. {v.count} inside now.</p>
            {v.checked_in && <p className="meta">{v.my_name}, you're checked in until {v.my_until}.</p>}
            {form?.id === v.id ? (
              <form className="checkin" onSubmit={confirm}>
                <label>Your name<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus /></label>
                <label>How many hours will you stay?
                  <select value={hours} onChange={(e) => setHours(e.target.value)}>
                    {[0.5, 1, 1.5, 2, 3, 4, 6, 8].map((h) => <option key={h} value={h}>{h} {h === 1 ? "hour" : "hours"}</option>)}
                  </select></label>
                <div className="row"><button type="submit">Confirm check-in</button>
                  <button type="button" className="out" onClick={() => setForm(null)}>Cancel</button></div>
              </form>
            ) : (
              <button className={v.checked_in ? "out" : ""}
                onClick={() => v.checked_in ? post("/checkout", { venue_id: v.id }, `Checked out of ${v.name}`) : (setMsg(""), setForm(v))}>
                {v.checked_in ? "Check out" : "Check in"}</button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function Heat({ grid }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="heat">
      <div className="hours">{Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? h : ""}</span>)}</div>
      {grid.map((row, d) => (
        <div className="hrow" key={d}>
          <b>{DAYS[d]}</b>
          {row.map((x, h) => <i key={h} title={`${DAYS[d]} ${h}:00, about ${x} arrivals`} style={{ opacity: 0.08 + 0.92 * (x / max) }} />)}
        </div>
      ))}
    </div>
  );
}

function Insights({ venues }) {
  const [id, setId] = useState(null);
  const [today, setToday] = useState([]);
  const [grid, setGrid] = useState(null);
  const [cmp, setCmp] = useState([]);
  useEffect(() => { if (venues && !id) setId(venues[0].id); }, [venues, id]);
  useEffect(() => { api("/venues/compare").then(setCmp).catch(() => {}); }, []);
  useEffect(() => {
    if (!id) return;
    api(`/venues/${id}/today`).then(setToday);
    api(`/venues/${id}/heatmap`).then((r) => setGrid(r.grid));
  }, [id]);
  if (!venues) return <p className="note">Loading…</p>;
  return (
    <section>
      <select value={id || ""} onChange={(e) => setId(+e.target.value)} aria-label="Venue">
        {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      <h3>Arrivals today, by hour</h3>
      <div className="chart"><ResponsiveContainer width="100%" height={220}>
        <BarChart data={today}><XAxis dataKey="hour" tickLine={false} /><YAxis allowDecimals={false} width={32} /><Tooltip />
          <Bar dataKey="arrivals" fill="#0f2a33" radius={[3, 3, 0, 0]} /></BarChart>
      </ResponsiveContainer></div>
      <h3>Typical week: darker means busier</h3>
      {grid && <Heat grid={grid} />}
      <h3>Venue comparison</h3>
      <div className="scroll"><table><thead><tr><th>Venue</th><th>Visits (30 days)</th><th>Avg stay</th><th>Busiest hours</th></tr></thead>
        <tbody>{cmp.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.total_visits}</td><td>{c.avg_stay_min} min</td><td>{c.peak_hours.map((h) => `${h}:00`).join(", ")}</td></tr>)}</tbody></table></div>
    </section>
  );
}

function Admin() {
  const [key, setKey] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const go = () => api("/admin/stats", { headers: { "x-admin-key": key } }).then((r) => { setRows(r); setErr(""); }).catch((e) => setErr(e.message));
  return (
    <section>
      <div className="row"><input type="password" placeholder="Admin key" value={key} onChange={(e) => setKey(e.target.value)} />
        <button onClick={go}>View stats</button></div>
      {err && <p className="note err">{err}</p>}
      {rows && <div className="scroll"><table><thead><tr><th>Venue</th><th>Total visits</th><th>Avg wait/stay</th><th>Forgot to check out</th><th>Peak hours</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.total_visits}</td><td>{r.avg_stay_min} min</td><td>{r.auto_expired_pct}%</td><td>{r.peak_hours.map((h) => `${h}:00`).join(", ")}</td></tr>)}</tbody></table></div>}
    </section>
  );
}

export default function App() {
  const [tab, setTab] = useState("live");
  const live = useLive();
  return (
    <main>
      <header><h1>QueueSense</h1>
        <nav>{[["live", "Live now"], ["insights", "Patterns"], ["admin", "Admin"]].map(([k, l]) =>
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav></header>
      {tab === "live" && <Live {...live} />}
      {tab === "insights" && <Insights venues={live.venues} />}
      {tab === "admin" && <Admin />}
    </main>
  );
}
