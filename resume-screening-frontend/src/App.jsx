import React, { useEffect, useRef, useState } from "react";

import ResumeForm from "./components/ResumeForm";

import "./App.css";



const API = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000").replace(/\/$/, "");

const MAX_SIZE = 10 * 1024 * 1024;

const EXTENSIONS = ["pdf", "docx", "jpg", "jpeg", "png", "webp"];



function mapHistoryItem(item) {

  return {

    id: item.id,

    // Prefer the uploaded filename; older database rows may not have one.

    name: item.resume_filename || item.candidate_name || `Candidate ${item.id}`,

    fileName: item.resume_filename ? "Uploaded resume" : "Saved screening record",

    result: String(item.result || item.prediction || "Unknown"),

    score:

      item.shortlisted_probability == null

        ? NaN

        : Number(item.shortlisted_probability),

    time: item.created_at || "Time unavailable",

  };

}



function App() {

  const [apiStatus, setApiStatus] = useState("checking");

  const [modelInfo, setModelInfo] = useState(null);

  const [file, setFile] = useState(null);

  const [initialData, setInitialData] = useState(null);

  const [extractionMeta, setExtractionMeta] = useState(null);

  const [result, setResult] = useState(null);

  const [history, setHistory] = useState([]);

  const [loading, setLoading] = useState(false);

  const [extracting, setExtracting] = useState(false);

  const [dragging, setDragging] = useState(false);

  const [fileError, setFileError] = useState("");

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState("All");

  const [activeNav, setActiveNav] = useState("Overview");
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const inputRef = useRef(null);



  useEffect(() => {

    let active = true;



    fetch(`${API}/model-info`)

      .then((res) => {

        if (!res.ok) throw new Error("Backend unavailable");

        return res.json();

      })

      .then((data) => {

        if (active) {

          setApiStatus("online");

          setModelInfo(data);

        }

      })

      .catch(() => {

        if (active) setApiStatus("offline");

      });



    return () => {

      active = false;

    };

  }, []);



  const refreshHistory = async () => {

    const response = await fetch(`${API}/history`);

    if (!response.ok) throw new Error("Failed to load screening history");

    const data = await response.json();

    setHistory((data.history || []).map(mapHistoryItem));

  };



  useEffect(() => {

    let active = true;



    const fetchHistory = async () => {

      try {

        const response = await fetch(`${API}/history`);

        if (!response.ok) throw new Error("Failed to load screening history");

        const data = await response.json();

        if (active) setHistory((data.history || []).map(mapHistoryItem));

      } catch (err) {

        console.error("History loading error:", err);

      }

    };



    fetchHistory();

    return () => {

      active = false;

    };

  }, []);



  const chooseFile = (selected) => {

    setFileError("");

    setError("");

    setMessage("");

    if (!selected) return;



    const ext = selected.name.split(".").pop().toLowerCase();

    if (!EXTENSIONS.includes(ext)) {

      setFile(null);

      setExtractionMeta(null);

      setFileError("Unsupported file. Choose PDF, DOCX, JPG, PNG or WEBP.");

      return;

    }

    if (!selected.size) {

      setFile(null);

      setExtractionMeta(null);

      setFileError("The selected file is empty.");

      return;

    }

    if (selected.size > MAX_SIZE) {

      setFile(null);

      setExtractionMeta(null);

      setFileError("Maximum file size is 10 MB.");

      return;

    }



    setFile(selected);

    setInitialData(null);

    setExtractionMeta(null);

    setResult(null);

  };



  const clearFile = () => {

    setFile(null);

    setInitialData(null);

    setExtractionMeta(null);

    setResult(null);

    setFileError("");

    setError("");

    setMessage("");

    if (inputRef.current) inputRef.current.value = "";

  };



  const extractResume = async () => {

    if (!file) {

      setFileError("Choose a resume first.");

      return;

    }



    setExtracting(true);

    setFileError("");

    setError("");

    setMessage("");

    setResult(null);



    try {

      const body = new FormData();

      body.append("resume", file);



      const response = await fetch(`${API}/extract-resume`, {

        method: "POST",

        body,

      });

      const data = await response.json();



      if (!response.ok) {

        throw new Error(data.error || data.details || "Resume extraction failed.");

      }



      const fields = data.candidate_fields || data.suggested_fields;

      if (!fields || typeof fields !== "object") {

        throw new Error("Candidate fields were not returned by the backend.");

      }



      setInitialData(fields);

      setExtractionMeta({

        history_id: data.history_id ?? null,

        filename: data.filename || file.name,

        candidate_name:

          data.candidate_name || file.name.replace(/\.[^.]+$/, ""),

      });

      setMessage("Resume extracted. Verify the suggested values and complete all missing fields.");



      // Refresh here too, so an upload-created Pending record can appear immediately.

      try {

        await refreshHistory();

      } catch (historyError) {

        console.error("History refresh after extraction failed:", historyError);

      }

    } catch (err) {

      setFileError(`${err.message} Check that Flask is running at ${API}.`);

    } finally {

      setExtracting(false);

    }

  };



  const screenCandidate = async (candidateData) => {

    setLoading(true);

    setError("");

    setMessage("");

    setResult(null);



    try {

      const response = await fetch(`${API}/predict`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          ...candidateData,

          history_id: extractionMeta?.history_id ?? undefined,

          resume_filename: extractionMeta?.filename || file?.name || null,

          candidate_name:

            extractionMeta?.candidate_name ||

            file?.name?.replace(/\.[^.]+$/, "") ||

            null,

        }),

      });



      const data = await response.json();

      if (!response.ok) {

        throw new Error(data.error || data.details || "Screening request failed.");

      }



      setResult(data);

      await refreshHistory();

    } catch (err) {

      setError(`${err.message} Check your Flask backend and API URL.`);

    } finally {

      setLoading(false);

    }

  };



  const goTo = (id, label) => {

    setActiveNav(label);

    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  };



  const scoreValue = result?.shortlisted_probability;

  const scoreNumber = scoreValue !== undefined && scoreValue !== null && scoreValue !== ""

    ? Number(scoreValue)

    : NaN;

  const score = Number.isFinite(scoreNumber)

    ? Math.min(100, Math.max(0, scoreNumber))

    : null;



  const shortlisted = history.filter((item) => /shortlist/i.test(item.result)).length;

  const filteredHistory = history.filter((item) => {

    const matchesText = `${item.name} ${item.fileName} ${item.result}`

      .toLowerCase()

      .includes(search.toLowerCase());

    const matchesFilter =

      filter === "All" ||

      (filter === "Shortlisted" && /shortlist/i.test(item.result)) ||

      (filter === "Other" && !/shortlist/i.test(item.result));

    return matchesText && matchesFilter;

  });


  const scoredHistory = history.filter((item) => Number.isFinite(item.score));
  const averageScore = scoredHistory.length ? scoredHistory.reduce((total, item) => total + item.score, 0) / scoredHistory.length : null;
  const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index));
    const nextDate = new Date(date); nextDate.setDate(nextDate.getDate() + 1);
    const count = history.filter((item) => { const parsed = new Date(item.time); return !Number.isNaN(parsed.getTime()) && parsed >= date && parsed < nextDate; }).length;
    return { label: date.toLocaleDateString(undefined, { weekday: "short" }), count };
  });
  const maxActivity = Math.max(1, ...weeklyActivity.map((day) => day.count));
  const getCandidateDetails = (item) => {
    const raw = item?.raw || {};
    const nested = raw.candidate_data || raw.candidate_fields || raw.features || raw.profile || {};
    const fields = Object.entries(nested && typeof nested === "object" ? nested : {}).filter(([key, value]) => !["id", "history_id"].includes(key) && value !== null && value !== undefined && value !== "").slice(0, 30);
    return fields.length ? fields : Object.entries(raw).filter(([key, value]) => !["id", "raw", "created_at", "resume_filename", "candidate_name", "result", "prediction", "shortlisted_probability"].includes(key) && value !== null && value !== undefined && value !== "" && typeof value !== "object").slice(0, 20);
  };

  return (

    <div className="dashboard">

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-logo">R<span>✦</span></div>

          <div><strong>Hire<span>Scope</span></strong><small>TALENT OPERATIONS</small></div>

        </div>



        <p className="nav-label">YOUR WORKSPACE</p>

        <nav className="side-nav">

          <button className={activeNav === "Overview" ? "nav-link active" : "nav-link"}

            onClick={() => goTo("overview", "Overview")}>▦ <span>Overview</span></button>

          <button className={activeNav === "Evaluate resume" ? "nav-link active" : "nav-link"}

            onClick={() => goTo("screen-workspace", "Evaluate resume")}>⇧ <span>Evaluate resume</span></button>

          <button className={activeNav === "Screening history" ? "nav-link active" : "nav-link"}

            onClick={() => goTo("screening-history", "Screening history")}>◷ <span>Screening history</span><em>{history.length}</em></button>

        </nav>



        <div className="sidebar-bottom">

          <div className="human-review">

            <span>◇</span>

            <div><strong>Human review first</strong><p>Predictions support assessment. They do not replace hiring judgment.</p></div>

          </div>

          <div className="workspace-user">

            <div className="user-avatar">RA</div>

            <div><strong>Hiring team workspace</strong><small>Local environment</small></div>

            <i className={`status-dot ${apiStatus}`} />

          </div>

        </div>

      </aside>



      <main className="main-panel">

        <header className="topbar">

          <div className="mobile-brand"><div className="brand-logo">R</div><strong>Hire<span>Scope</span></strong></div>

          <div className="breadcrumb">Workspace <span>/</span> <strong>{activeNav}</strong></div>

          <div className={`api-status ${apiStatus}`}>

            <i />{apiStatus === "online" ? "Backend connected" : apiStatus === "offline" ? "Backend offline" : "Checking backend"}

          </div>

        </header>



        <div className="page-content" id="overview">

          <section className="welcome">

            <div>

              <div className="eyebrow"><span /> HIRING WORKSPACE</div>

              <h1>Talent <b>Overview</b></h1>

              <p>A thoughtful workspace for reviewing candidate profiles and screening activity.</p>

            </div>

            <button className="primary-button" onClick={() => goTo("screen-workspace", "Evaluate resume")}>＋ Evaluate a resume</button>

          </section>



          <section className="stats-grid">

            <article className="stat-card">

              <div className="stat-heading"><span>Candidates screened</span><i className="stat-icon blue">♙</i></div>

              <strong>{history.length}</strong><small>All saved screening records</small>

            </article>

            <article className="stat-card">

              <div className="stat-heading"><span>Shortlisted predictions</span><i className="stat-icon green">✓</i></div>

              <strong>{shortlisted}</strong><small>Based on model responses</small>

            </article>

            <article className="stat-card">

              <div className="stat-heading"><span>Other predictions</span><i className="stat-icon amber">⌁</i></div>

              <strong>{history.length - shortlisted}</strong><small>Not labelled as shortlisted</small>

            </article>

            <article className="stat-card">

              <div className="stat-heading"><span>Screening service</span><i className={`stat-icon ${apiStatus === "online" ? "green" : "blue"}`}>⌁</i></div>

              <strong className={`service-value ${apiStatus}`}>{apiStatus === "online" ? "Connected" : apiStatus === "offline" ? "Unavailable" : "Checking…"}</strong>

              <small>{modelInfo ? "Model info endpoint responded" : "Flask /model-info"}</small>

            </article>

          </section>



          <section className="analytics-grid" aria-label="Screening analytics">
            <article className="panel analytics-panel activity-panel">
              <div className="section-title-row"><div><span className="section-kicker">YOUR WORKSPACE INSIGHTS</span><h2>Pipeline activity</h2><p>Saved records over the last seven days.</p></div><span className="analytics-icon">↗</span></div>
              <div className="activity-chart" role="img" aria-label="Daily screening record counts for the last seven days">
                {weeklyActivity.map((day, index) => <div className="activity-day" key={`${day.label}-${index}`}><span className="activity-count">{day.count || ""}</span><div className="activity-bar-track"><span style={{ height: `${Math.max(day.count ? 12 : 3, (day.count / maxActivity) * 100)}%` }} /></div><small>{day.label}</small></div>)}
              </div>
              <div className="chart-footnote"><span><i className="legend-dot" /> Saved screenings</span><span>Last 7 days</span></div>
            </article>
            <article className="panel analytics-panel outcome-panel">
              <div className="section-title-row"><div><span className="section-kicker">MODEL SNAPSHOT</span><h2>Candidate outcomes</h2><p>Based on records currently available.</p></div><span className="analytics-icon">◌</span></div>
              <div className="outcome-summary"><div className="outcome-ring" style={{ "--ratio": `${history.length ? (shortlisted / history.length) * 100 : 0}%` }}><div><strong>{history.length ? Math.round((shortlisted / history.length) * 100) : 0}%</strong><small>shortlisted</small></div></div>
                <div className="outcome-legend"><div><span className="legend-swatch shortlist-swatch"/><span>Shortlisted</span><strong>{shortlisted}</strong></div><div><span className="legend-swatch other-swatch"/><span>Other results</span><strong>{history.length - shortlisted}</strong></div><div><span className="legend-swatch score-swatch"/><span>With probability</span><strong>{scoredHistory.length}</strong></div></div></div>
              <div className="average-score"><span>Average recorded probability</span><strong>{averageScore === null ? "—" : `${averageScore.toFixed(1)}%`}</strong></div>
              <p className="analytics-note">Descriptive summaries of saved predictions, not a measure of model accuracy or hiring quality.</p>
            </article>
          </section>

          <section className="panel" id="screen-workspace">

            <div className="panel-heading">

              <div className="panel-heading-icon">▤</div>

              <div><h2>Evaluate a candidate</h2><p>Upload a resume, review the extracted details, and run the model.</p></div>

              <span className="step-count">3-step workflow</span>

            </div>



            <div className="steps">

              <div className="step active"><i>1</i><div><strong>Upload</strong><small>Select resume</small></div></div><span className="step-line" />

              <div className={`step ${initialData ? "done" : ""}`}><i>{initialData ? "✓" : "2"}</i><div><strong>Review</strong><small>Verify fields</small></div></div><span className="step-line" />

              <div className={`step ${result ? "done" : ""}`}><i>{result ? "✓" : "3"}</i><div><strong>Predict</strong><small>View result</small></div></div>

            </div>



            <div className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}

              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}

              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}

              onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0]); }}>

              <input ref={inputRef} type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"

                onChange={(e) => { chooseFile(e.target.files?.[0]); e.target.value = ""; }} />

              {file ? <>

                <div className="upload-icon selected">▤</div>

                <strong className="filename">{file.name}</strong>

                <p>{file.size < 1048576 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1048576).toFixed(2)} MB`} · Ready to process</p>

                <div className="file-buttons">

                  <button className="text-button" onClick={() => inputRef.current?.click()} disabled={loading || extracting}>Replace file</button>

                  <button className="text-button danger" onClick={clearFile} disabled={loading || extracting}>Remove</button>

                </div>

              </> : <>

                <div className="upload-icon">⇧</div>

                <h3>Drop your resume here</h3>

                <p>or browse files from your computer</p>

                <button className="secondary-button" onClick={() => inputRef.current?.click()}>Choose resume</button>

                <small>PDF, DOCX, JPG, PNG, WEBP · Maximum 10 MB</small>

              </>}

            </div>



            <div className="upload-help">

              <div><span>✦</span><section><strong>Smart field extraction</strong><p>Extracted values are suggestions. Confirm them against the resume.</p></section></div>

              <div><span>◇</span><section><strong>Review before prediction</strong><p>Check projects, experience, skill scores and word count.</p></section></div>

            </div>



            {fileError && <div className="notice error" role="alert">{fileError}</div>}

            {message && <div className="notice success" role="status">✓ {message}</div>}

            {file && <button className="primary-button full-button" onClick={extractResume} disabled={extracting || loading}>

              {extracting ? "◌ Extracting resume details…" : "✦ Extract resume details"}

            </button>}



            <div className="divider-label"><span>Candidate information</span></div>

            <div className="candidate-heading"><div><h3>Candidate profile</h3><p>Fill manually or review values populated from resume extraction.</p></div>

              <span className={initialData ? "review-label ready" : "review-label"}>{initialData ? "Review extracted data" : "Manual entry available"}</span>

            </div>



            <ResumeForm onScreen={screenCandidate} initialData={initialData} loading={loading || extracting} />



            {loading && <div className="notice loading" role="status">◌ Sending candidate profile to the screening model…</div>}

            {error && <div className="notice error" role="alert">{error}</div>}



            {result && <section className="result-panel" aria-live="polite">

              <div className="result-heading"><div><div className="eyebrow">MODEL OUTPUT</div><h3>Screening result</h3></div>

                <span className={`result-badge ${/shortlist/i.test(String(result.result || "")) ? "positive" : ""}`}>{result.result || "Result unavailable"}</span>

              </div>

              <div className="score-row"><div><small>Shortlisted probability</small><strong>{score === null ? "N/A" : `${score.toFixed(2)}%`}</strong></div>

                <div className="score-circle" style={{ "--score": `${score ?? 0}%` }}><span>{score === null ? "—" : `${Math.round(score)}%`}</span></div>

              </div>

              <div className="score-track"><span style={{ width: `${score ?? 0}%` }} /></div>

              <p className="disclaimer">◇ This is a model prediction, not a hiring guarantee. Review the candidate information and use fair, job-related criteria.</p>

            </section>}

            {result && <section className="explanation-panel" aria-label="How to read this result"><div className="explanation-mark">i</div><div className="explanation-copy"><h3>How to read this result</h3><p>The displayed percentage is the probability returned by your screening model. It is not a guarantee of job performance or a final hiring decision.</p><div className="explanation-points"><div><strong>Model output</strong><span>{result.result || "Prediction returned"}</span></div><div><strong>Probability</strong><span>{score === null ? "Not provided" : `${score.toFixed(2)}% shortlisted probability`}</span></div><div><strong>Next step</strong><span>Review the profile and apply consistent, job-related criteria.</span></div></div><p className="analytics-note">Feature-level explanations are not shown because the current prediction response does not provide verified per-feature attributions.</p></div></section>}

          </section>



          <section className="panel history-panel" id="screening-history">

            <div className="panel-heading history-heading"><div><h2>Recent candidate reviews</h2><p>Saved screening records from your database.</p></div><span className="record-count">{history.length} records</span></div>

            <div className="history-tools">

              <label className="search-input">⌕ <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search candidate or file…" /></label>

              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter results">

                <option value="All">All results</option><option value="Shortlisted">Shortlisted</option><option value="Other">Other results</option>

              </select>

            </div>

            {filteredHistory.length ? <div className="table-scroll"><table><thead><tr><th>Candidate / file</th><th>Prediction</th><th>Probability</th><th>Screened at</th></tr></thead>

              <tbody>{filteredHistory.map((item) => <tr key={item.id} className="history-row" onClick={() => setSelectedCandidate(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedCandidate(item); } }} aria-label={`View details for ${item.name}`}>

                <td><strong title={item.name}>{item.name}</strong><small className="table-subtitle">{item.fileName} · View details ↗</small></td>

                <td><span className={`table-result ${/shortlist/i.test(item.result) ? "positive" : ""}`}>{item.result}</span></td>

                <td>{Number.isFinite(item.score) ? `${Math.max(0, Math.min(100, item.score)).toFixed(2)}%` : "N/A"}</td>

                <td>{item.time}</td>

              </tr>)}</tbody></table></div> :

              <div className="empty-state"><div>▤</div><strong>{history.length ? "No matching records" : "No screening activity yet"}</strong>

                <p>{history.length ? "Try another search or filter." : "Screen your first candidate and the result will appear here."}</p>

              </div>}

          </section>



          {selectedCandidate && <div className="detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCandidate(null); }}><section className="candidate-detail" role="dialog" aria-modal="true" aria-labelledby="candidate-detail-title"><div className="detail-header"><div><span className="section-kicker">SCREENING RECORD</span><h2 id="candidate-detail-title">Candidate details</h2><p>Saved information returned by the screening history API.</p></div><button className="icon-button" onClick={() => setSelectedCandidate(null)} aria-label="Close candidate details">×</button></div><div className="detail-profile"><div className="detail-avatar">{String(selectedCandidate.name || "C").slice(0, 1).toUpperCase()}</div><div className="detail-name"><strong>{selectedCandidate.name}</strong><span>{selectedCandidate.fileName}</span></div><span className={`table-result ${/shortlist/i.test(selectedCandidate.result) ? "positive" : ""}`}>{selectedCandidate.result}</span></div><div className="detail-metrics"><div><span>Shortlisted probability</span><strong>{Number.isFinite(selectedCandidate.score) ? `${Math.max(0, Math.min(100, selectedCandidate.score)).toFixed(2)}%` : "N/A"}</strong></div><div><span>Screened at</span><strong>{selectedCandidate.time}</strong></div><div><span>Record ID</span><strong>{selectedCandidate.id ?? "Not provided"}</strong></div></div><div className="detail-fields-heading"><h3>Available candidate fields</h3><span>From saved record</span></div>{getCandidateDetails(selectedCandidate).length ? <dl className="detail-fields">{getCandidateDetails(selectedCandidate).map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, " ")}</dt><dd>{String(value)}</dd></div>)}</dl> : <div className="detail-empty"><strong>No additional profile fields in this history response</strong><p>The saved history endpoint currently provides the prediction summary only. To show the full extracted resume profile here, the backend history response would need to include those fields.</p></div>}<p className="detail-disclaimer">Use this record as decision support only. Verify candidate information and keep a human reviewer involved.</p></section></div>}

          <footer className="app-footer"><strong>HireScope</strong><span>AI-assisted screening · Human review required</span><span>React UI · Flask API</span></footer>

        </div>

      </main>

    </div>

  );

}



export default App;