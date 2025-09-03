const tableBody = document.getElementById("tableBody");
const modal = document.getElementById("videoModal");
const viewModal = document.getElementById("viewModal");
const form = document.getElementById("videoForm");
let videoData = [];

// ====== Helpers ======
function truncateText(str, words = 4) {
  if (!str) return "";
  const arr = str.split(" ");
  return arr.length > words ? arr.slice(0, words).join(" ") + "…" : str;
}

function parseRelation(rel) {
  if (!rel) return [];
  const data = rel.data ?? rel;
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map(it => ({ id: it.id, label: getRelLabel(it.attributes) }));
  } else if (typeof data === "object") {
    return [{ id: data.id, label: getRelLabel(data.attributes) }];
  }
  return [];
}

function getRelLabel(attrs) {
  if (!attrs) return "";
  return attrs.name || attrs.title || `#${attrs.id || ""}`;
}

// ====== Fetch Data ======
async function fetchVideos() {
  try {
const res = await fetch(
  "https://v2.app.aadiyog.in/api/videos?populate=workouts"
);
    const data = await res.json();
    videoData = (data.data || []).map(item => {
      const attrs = item.attributes || {};
      return {
        id: item.id,
        title: attrs.title || "",
        description: attrs.description || "",
        url: attrs.url || "",
        duration: attrs.duration || 0,
        reps: attrs.reps || 0,
        imgUrl: attrs.imgUrl || "",
        jsonUrl: attrs.jsonUrl || "",
        workouts: parseRelation(attrs.workouts),
        // testing: parseRelation(attrs.testing),
        extraData: attrs.extraData || null
      };
    });
    renderTable();
  } catch (err) {
    console.error("Error fetching videos:", err);
  }
}

async function fetchRelationOptions(endpoint, selectId, labelFields = ["name"]) {
  try {
    const res = await fetch(`https://v2.app.aadiyog.in/api/${endpoint}?pagination[pageSize]=100&fields=${labelFields.join(",")}`);
    const json = await res.json();
    const items = json.data || [];
    const select = document.getElementById(selectId);
    select.innerHTML = "";
    if (!select.multiple) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.text = "-- none --";
      select.appendChild(opt);
    }
    items.forEach(it => {
      const label = labelFields.map(f => it.attributes[f]).find(Boolean) || `#${it.id}`;
      const option = document.createElement("option");
      option.value = it.id;
      option.text = label;
      select.appendChild(option);
    });
  } catch (err) {
    console.error("fetchRelationOptions error:", endpoint, err);
  }
}

// ====== Table ======
function renderTable() {
  tableBody.innerHTML = "";
  videoData.forEach((video, index) => {
    const row = document.createElement("tr");
    if (!video.title || !video.description || !video.url) row.classList.add("highlight");

    const workoutsText = video.workouts.map(w => w.label).join(", ") || "—";
    // const testingText = video.testing.map(t => t.label).join(", ") || "—";

    row.innerHTML = `
      <td>${video.imgUrl ? `<img src="${video.imgUrl}" alt="thumb">` : "❌"}</td>
      <td class="truncate">${truncateText(video.title)}</td>
      <td class="truncate">${truncateText(video.description)}</td>
      <td class="truncate">${truncateText(video.url, 3)}</td>
      <td>${video.duration}</td>
      <td>${video.reps}</td>
      <td class="truncate">${truncateText(workoutsText, 6)}</td>
      <td class="actions">
        <button class="view-btn" onclick="viewRow(${index})">View</button>
        <button class="edit-btn" onclick="editRow(${index})">Edit</button>
        <button class="delete-btn" onclick="deleteRow(${index})">Delete</button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// ====== Modals ======
function openModal() { modal.style.display = "block"; }
function closeModal() { modal.style.display = "none"; }
function openViewModal() { viewModal.style.display = "block"; }
function closeViewModal() { viewModal.style.display = "none"; }

function viewRow(index) {
  const video = videoData[index];
  const workoutsText = video.workouts.map((w) => w.label).join(", ") || "—";

  document.getElementById("viewContent").innerHTML = `
    <p><strong>Title:</strong> ${video.title}</p>
    <p><strong>Description:</strong> ${video.description}</p>
    <p><strong>URL:</strong> <a href="${video.url}" target="_blank">${
    video.url
  }</a></p>
    <p><strong>Duration:</strong> ${video.duration}</p>
    <p><strong>Reps:</strong> ${video.reps}</p>
    <p><strong>Workouts:</strong> ${workoutsText}</p>
    <p><strong>Extra Data:</strong> <pre>${JSON.stringify(
      video.extraData,
      null,
      2
    )}</pre></p>
  `;
  openViewModal();
}


function editRow(index) {
  const video = videoData[index];
  document.getElementById("modalTitle").innerText = "Edit Video";
  document.getElementById("rowIndex").value = index;
  fillForm(video);
  openModal();
}

function fillForm(video) {
  document.getElementById("title").value = video.title;
  document.getElementById("description").value = video.description;
  document.getElementById("url").value = video.url;
  document.getElementById("duration").value = video.duration;
  document.getElementById("reps").value = video.reps;
  document.getElementById("imgUrl").value = video.imgUrl;
  document.getElementById("jsonUrl").value = video.jsonUrl;
  document.getElementById("extraData").value = video.extraData ? JSON.stringify(video.extraData, null, 2) : "";

  const workoutsSelect = document.getElementById("workoutsSelect");
  const idsW = video.workouts.map(w => String(w.id));
  Array.from(workoutsSelect.options).forEach(opt => {
    opt.selected = idsW.includes(opt.value);
  });

//   const testingSelect = document.getElementById("testingSelect");
//   const idsT = video.testing.map(t => String(t.id));
//   Array.from(testingSelect.options).forEach(opt => {
//     opt.selected = idsT.includes(opt.value);
//   });
}

// ====== Save ======
function getSelectedIds(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return null;
  const selected = Array.from(select.selectedOptions).map(o => o.value).filter(Boolean).map(Number);
  return select.multiple ? selected : (selected[0] || null);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const newVideo = {
    title: document.getElementById("title").value,
    description: document.getElementById("description").value,
    url: document.getElementById("url").value,
    duration: parseInt(document.getElementById("duration").value) || 0,
    reps: parseInt(document.getElementById("reps").value) || 0,
    imgUrl: document.getElementById("imgUrl").value,
    jsonUrl: document.getElementById("jsonUrl").value,
  };

  const extraRaw = document.getElementById("extraData").value.trim();
  try {
    newVideo.extraData = extraRaw ? JSON.parse(extraRaw) : null;
  } catch {
    alert("Invalid JSON in Extra Data");
    return;
  }

  const workoutsVal = getSelectedIds("workoutsSelect");
//   const testingVal = getSelectedIds("testingSelect");
  if (workoutsVal !== null) newVideo.workouts = workoutsVal;
//   if (testingVal !== null) newVideo.testing = testingVal;

  const index = document.getElementById("rowIndex").value;
  try {
    if (index === "") {
      await fetch("https://v2.app.aadiyog.in/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: newVideo })
      });
    } else {
      const id = videoData[index].id;
      await fetch(`https://v2.app.aadiyog.in/api/videos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: newVideo })
      });
    }
    closeModal();
    await fetchVideos();
  } catch (err) {
    console.error("Save failed:", err);
  }
});

// ====== Delete ======
async function deleteRow(index) {
  const id = videoData[index].id;
  if (!confirm("Delete this video?")) return;
  try {
    await fetch(`https://v2.app.aadiyog.in/api/videos/${id}`, { method: "DELETE" });
    await fetchVideos();
  } catch (err) {
    console.error("Delete failed:", err);
  }
}

// ====== Init ======
document.getElementById("addBtn").onclick = () => {
  document.getElementById("modalTitle").innerText = "Add Video";
  form.reset();
  document.getElementById("rowIndex").value = "";
  openModal();
};

window.onclick = (e) => {
  if (e.target === modal) closeModal();
  if (e.target === viewModal) closeViewModal();
};

fetchVideos();
fetchRelationOptions("workouts", "workoutsSelect", ["name"]);
// fetchRelationOptions("testing", "testingSelect", ["title"]);
