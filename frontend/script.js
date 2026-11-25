const API = "http://127.0.0.1:8000";
let role = "citizen";
let currentUser = null;
let currentComplaint = null;
let recognition = null;
let recording = false;
let latitude = null, longitude = null;

const $ = (id) => document.getElementById(id);

document.querySelectorAll(".role-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    role = btn.dataset.role;
    document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    $("citizenCreds").classList.toggle("hidden", role !== "citizen");
    $("authorityCreds").classList.toggle("hidden", role !== "authority");
  });
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginError").classList.add("hidden");
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({identifier:$("loginIdentifier").value.trim(), password:$("loginPassword").value, role})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Login failed");
    currentUser = data.user;
    localStorage.setItem("civic360_user", JSON.stringify(currentUser));
    showDashboard();
  } catch (err) {
    $("loginError").textContent = err.message || "Could not connect to the Civic360 backend.";
    $("loginError").classList.remove("hidden");
  }
});

function showDashboard() {
  $("loginView").classList.add("hidden");
  if (currentUser.role === "citizen") {
    $("citizenView").classList.remove("hidden");
    $("citizenUserBadge").textContent = `${currentUser.user_id} · ${currentUser.name}`;
    loadCitizenComplaints();
  } else {
    $("authorityView").classList.remove("hidden");
    $("authorityUserBadge").textContent = `${currentUser.user_id} · ${currentUser.name}`;
    $("adminDate").textContent = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    loadAdminComplaints();
  }
}

document.querySelectorAll(".logout-btn").forEach(btn => btn.addEventListener("click", () => {
  localStorage.removeItem("civic360_user");
  currentUser = null;
  $("citizenView").classList.add("hidden");
  $("authorityView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
}));

// VOICE + ENGLISH NORMALISATION
const speechCodes = {English:"en-IN", Hindi:"hi-IN", Kannada:"kn-IN", Telugu:"te-IN", Tamil:"ta-IN", Marathi:"mr-IN"};

$("voiceButton").addEventListener("click", () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $("voiceStatus").textContent = "Voice input is unavailable in this browser. You can type instead.";
    return;
  }
  if (recording) { recognition.stop(); return; }

  recognition = new SR();
  recognition.lang = speechCodes[$("language").value] || "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    recording = true;
    $("voiceButton").textContent = "⏹ Stop recording";
    $("voiceStatus").textContent = "Listening… speak naturally.";
  };
  recognition.onresult = async (event) => {
    const raw = event.results[0][0].transcript.trim();
    $("description").value = raw;
    $("voiceStatus").textContent = `Captured: ${raw}`;
    await translateStatement(raw, $("language").value);
  };
  recognition.onerror = () => {
    $("voiceStatus").textContent = "Voice input could not be completed. Try again or type.";
  };
  recognition.onend = () => {
    recording = false;
    $("voiceButton").textContent = "🎙️ Start voice input";
  };
  recognition.start();
});

$("description").addEventListener("blur", async () => {
  const text = $("description").value.trim();
  if (text && $("language").value !== "English") await translateStatement(text, $("language").value);
});

async function translateStatement(text, language) {
  try {
    const res = await fetch(`${API}/translate`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text, language})
    });
    const data = await res.json();
    $("englishStatement").textContent = data.english_statement;
    $("translationNote").textContent = data.note || "AI-assisted English normalisation.";
    $("translationBox").classList.remove("hidden");
  } catch {
    $("englishStatement").textContent = text;
    $("translationNote").textContent = "Translation service unavailable; original text retained.";
    $("translationBox").classList.remove("hidden");
  }
}

// GPS
$("locationButton").addEventListener("click", () => {
  if (!navigator.geolocation) { $("locationStatus").textContent = "GPS is not supported."; return; }
  $("locationStatus").textContent = "Requesting location…";
  navigator.geolocation.getCurrentPosition(
    p => {
      latitude = p.coords.latitude; longitude = p.coords.longitude;
      $("locationStatus").textContent = `Location added: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    },
    () => $("locationStatus").textContent = "Location permission was denied or unavailable."
  );
});

// CITIZEN SUBMISSION
$("complaintForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("description").value.trim();
  if (!text) return showMessage("Please describe the problem.", "error");
  $("submitButton").disabled = true;
  $("submitButton").textContent = "Submitting…";
  try {
    const res = await fetch(`${API}/complaints`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        user_id: currentUser.user_id,
        description: text,
        language: $("language").value,
        latitude, longitude,
        category: $("category").value || null
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Submission failed");
    showMessage(`Complaint ${data.complaint.complaint_id} submitted. AI categories: ${(data.complaint.categories || [data.complaint.category]).join(" + ")}. Priority: ${data.complaint.priority}.`, "success");
    $("complaintForm").reset();
    $("translationBox").classList.add("hidden");
    latitude = longitude = null;
    $("locationStatus").textContent = "Location not added.";
    loadCitizenComplaints();
  } catch (err) {
    showMessage(err.message || "Could not submit complaint.", "error");
  } finally {
    $("submitButton").disabled = false;
    $("submitButton").innerHTML = 'Submit complaint <span>→</span>';
  }
});

function showMessage(text,type) {
  $("formMessage").textContent = text;
  $("formMessage").className = `message ${type}`;
}

async function loadCitizenComplaints() {
  try {
    const res = await fetch(`${API}/complaints/user/${encodeURIComponent(currentUser.user_id)}`);
    const data = await res.json();
    const complaints = data.complaints || [];
    $("citizenComplaintCount").textContent = complaints.length;
    if (!complaints.length) {
      $("citizenComplaints").innerHTML = `<div class="muted">No complaints yet.</div>`;
      return;
    }
    $("citizenComplaints").innerHTML = `<table class="data-table"><thead><tr><th>ID</th><th>Problem</th><th>Category</th><th>Priority</th><th>Progress</th><th>Working status</th></tr></thead><tbody>
      ${complaints.map(c => `<tr><td class="id">${esc(c.complaint_id)}</td><td>${esc(c.english_statement || c.description)}</td><td>${renderCategories(c)}</td><td><span class="priority ${c.priority.toLowerCase()}">${esc(c.priority)}</span></td><td><span class="status ${statusClass(c.status)}">${esc(c.status)}</span></td><td>${esc(c.working_status)}</td></tr>`).join("")}
    </tbody></table>`;
  } catch {
    $("citizenComplaints").innerHTML = `<div class="message error">Could not load your complaints. Make sure the backend is running.</div>`;
  }
}
$("refreshCitizen").addEventListener("click", loadCitizenComplaints);

function renderCategories(c){
  const cats = c.categories || (c.category ? String(c.category).split(" + ") : []);
  return cats.map(x => `<span class="category-chip">${esc(x)}</span>`).join(" ");
}
function statusClass(s){ return s==="Resolved"?"resolved":s==="In Progress"?"progress":"pending"; }
function esc(v){ return String(v ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }

// ADMIN
async function loadAdminComplaints() {
  try {
    const qs = new URLSearchParams();
    if ($("statusFilter").value) qs.set("status",$("statusFilter").value);
    if ($("priorityFilter").value) qs.set("priority",$("priorityFilter").value);
    if ($("categoryFilter").value) qs.set("category",$("categoryFilter").value);
    const res = await fetch(`${API}/admin/complaints?${qs}`);
    const data = await res.json();
    renderAdmin(data.complaints || []);
    updateStats(data.complaints || []);
  } catch {
    $("adminComplaints").innerHTML = `<div class="message error">Could not load complaints from the backend.</div>`;
  }
}
function updateStats(cs){
  $("statTotal").textContent=cs.length;
  $("statPending").textContent=cs.filter(c=>c.status==="Pending").length;
  $("statProgress").textContent=cs.filter(c=>c.status==="In Progress").length;
  $("statResolved").textContent=cs.filter(c=>c.status==="Resolved").length;
  $("statHigh").textContent=cs.filter(c=>c.priority==="High").length;
}
function renderAdmin(cs){
  if(!cs.length){$("adminComplaints").innerHTML='<div class="muted">No complaints match the selected filters.</div>';return}
  $("adminComplaints").innerHTML=`<table class="data-table"><thead><tr><th>Citizen ID</th><th>Complaint ID</th><th>Problem statement</th><th>Category</th><th>Priority</th><th>Progress</th><th>Working status</th><th></th></tr></thead><tbody>
  ${cs.map(c=>`<tr><td class="id">${esc(c.user_id)}</td><td>${esc(c.complaint_id)}</td><td>${esc(c.english_statement||c.description)}</td><td>${renderCategories(c)}</td><td><span class="priority ${c.priority.toLowerCase()}">${esc(c.priority)}</span></td><td><span class="status ${statusClass(c.status)}">${esc(c.status)}</span></td><td>${esc(c.working_status)}</td><td><button class="view-btn" onclick="openComplaint('${encodeURIComponent(c.complaint_id)}')">View</button></td></tr>`).join("")}
  </tbody></table>`;
}
$("statusFilter").addEventListener("change",loadAdminComplaints);
$("priorityFilter").addEventListener("change",loadAdminComplaints);
$("categoryFilter").addEventListener("change",loadAdminComplaints);
$("refreshAdmin").addEventListener("click",loadAdminComplaints);

window.openComplaint = async function(encodedId){
  const id=decodeURIComponent(encodedId);
  const res=await fetch(`${API}/complaints/${encodeURIComponent(id)}`);
  const data=await res.json();
  if(!res.ok)return;
  currentComplaint=data.complaint;
  $("adminDetail").classList.remove("hidden");
  $("dUserId").textContent=currentComplaint.user_id;
  $("dComplaintId").textContent=currentComplaint.complaint_id;
  $("dCategory").innerHTML=renderCategories(currentComplaint);
  $("dPriority").textContent=currentComplaint.priority;
  $("dStatus").textContent=currentComplaint.status;
  $("dWorking").textContent=currentComplaint.working_status;
  $("dStatement").textContent=currentComplaint.english_statement||currentComplaint.description;
  $("statusUpdate").value=currentComplaint.status;
  $("adminDetail").scrollIntoView({behavior:"smooth"});
}
$("closeDetail").addEventListener("click",()=> $("adminDetail").classList.add("hidden"));
$("updateStatusButton").addEventListener("click",async()=>{
  if(!currentComplaint)return;
  const status=$("statusUpdate").value;
  const res=await fetch(`${API}/admin/complaints/${encodeURIComponent(currentComplaint.complaint_id)}/status`,{
    method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,authority_id:currentUser.user_id})
  });
  const data=await res.json();
  if(!res.ok){$("adminMessage").textContent=data.detail||"Update failed";$("adminMessage").className="message error";return}
  currentComplaint=data.complaint;
  $("dStatus").textContent=currentComplaint.status;
  $("dWorking").textContent=currentComplaint.working_status;
  $("adminMessage").textContent="Work status updated successfully.";
  $("adminMessage").className="message success";
  loadAdminComplaints();
});

const saved=localStorage.getItem("civic360_user");
if(saved){try{currentUser=JSON.parse(saved);showDashboard()}catch{}}
