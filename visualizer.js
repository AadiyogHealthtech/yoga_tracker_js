
// Global variables
let pose;
let videoPlayer;
let poseCanvas;
let poseCtx;
let currentPoseLandmarks = null;
let poseDetectionEnabled = false;
let animationId = null;
let extractedFrames = [];
let frameData = null;
let videoDuration = 0;
let segments = [];
let selectedFrameForSegment = null;

// MediaPipe Pose connections
const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
    [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
    [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
];

// Body part keypoint indices (MediaPipe pose landmarks)
const BODY_PARTS = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

const THRESHOLD_COLORS = {
  nose: "rgba(130, 25, 25, 0.3)",
  leftEye: "rgba(0, 255, 0, 0.3)",
  rightEye: "rgba(0, 0, 255, 0.3)",
  leftShoulder: "rgba(20, 20, 1, 0.3)",
  rightShoulder: "rgba(65, 4, 65, 0.3)",
  leftElbow: "rgba(0, 255, 255, 0.3)",
  rightElbow: "rgba(128, 0, 0, 0.3)",
  leftWrist: "rgba(0, 128, 0, 0.3)",
  rightWrist: "rgba(0, 0, 128, 0.3)",
  leftHip: "rgba(32, 32, 22, 0.3)",
  rightHip: "rgba(128, 0, 128, 0.3)",
  leftKnee: "rgba(0, 128, 128, 0.3)",
  rightKnee: "rgba(64, 64, 64, 0.3)",
  leftAnkle: "rgba(192, 192, 192, 0.3)",
  rightAnkle: "rgba(255, 128, 0, 0.3)",
};

// Initialize the application
async function init() {
    await initializeMediaPipe();
  setupEventListeners();
  setupPhaseSelection(); 
}

// Initialize MediaPipe Pose
async function initializeMediaPipe() {
    pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    
    pose.setOptions({
        modelComplexity: 2,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });
    
    pose.onResults(onPoseResults);
    await pose.initialize();
}

// Handle pose detection results
function onPoseResults(results) {
    currentPoseLandmarks = results.poseLandmarks;
    if (poseDetectionEnabled && currentPoseLandmarks) {
        drawPose(currentPoseLandmarks);
    }
}

function setupPhaseSelection() {
  const phaseSelect = document.getElementById("phaseSelect");
  const addPhaseBtn = document.getElementById("addPhaseBtn");
  const phaseTimeRanges = document.getElementById("phaseTimeRanges");

  addPhaseBtn.addEventListener("click", () => {
    const selectedPhase = phaseSelect.value.trim();
    if (!selectedPhase) {
      alert("Please select a phase first");
      return;
    }

    // Normalize the base phase name (e.g., remove any trailing numbers or whitespace)
    const basePhaseName = selectedPhase.replace(/\s*\d+$/, "");

    // Get all existing phases and normalize their base names
    const existingPhases = Array.from(
      document.querySelectorAll(".phase-label")
    ).map((el) => el.textContent.replace(" Phase:", "").trim());

    const samePhases = existingPhases.filter((name) => {
      const base = name.replace(/\s*\d+$/, "").toLowerCase();
      return base === basePhaseName.toLowerCase();
    });

    const phaseNumber = samePhases.length + 1;
    const displayPhaseName = `${basePhaseName} `;
    const phaseId = `${basePhaseName
      .toLowerCase()
      .replace(/\s+/g, "")}Phase${phaseNumber}`;

    // Create new phase time range inputs
    const phaseDiv = document.createElement("div");
    phaseDiv.className = "phase-row";
    phaseDiv.innerHTML = `
      <label class="phase-label">${displayPhaseName} Phase: ${phaseNumber}</label>
      <input type="number" id="${phaseId}PhaseMin" class="range-input" placeholder="Start time" min="0" step="0.1">
      <span>to</span>
      <input type="number" id="${phaseId}PhaseMax" class="range-input" placeholder="End time" min="0.1" step="0.1">
      <button class="btn secondary remove-phase" data-phase="${displayPhaseName}">Remove</button>
    `;

    phaseTimeRanges.appendChild(phaseDiv);

    // Add remove button handler
    phaseDiv.querySelector(".remove-phase").addEventListener("click", () => {
      phaseDiv.remove();
    });
  });
}


// Add this function to handle phase dropdown changes in the segment form
function setupSegmentPhaseListener() {
  const segmentPhaseDropdown = document.getElementById("segmentPhase");
  if (segmentPhaseDropdown) {
    segmentPhaseDropdown.addEventListener("change", () => {
      // Clear the current selection
      selectedFrameForSegment = null;
      // Refresh the frame display for the new phase
      const frameSelection = document.getElementById("frameSelection");
      if (frameSelection) {
        showSegmentFramesForCurrentPhase();
      }
    });
  }
}

// Helper function to refresh frames when phase changes
function showSegmentFramesForCurrentPhase() {
  const frameSelection = document.getElementById("frameSelection");
  frameSelection.innerHTML = "";

  const selectedPhase = document.getElementById("segmentPhase").value;

// Filter frames by exact phase name match (including numbers)
  const phaseFrames = extractedFrames.filter((frame) => {
    return frame.name.startsWith(selectedPhase);
  });

  if (phaseFrames.length === 0) {
    frameSelection.innerHTML = `<p>No frames available for "${selectedPhase}" phase</p>`;
    return;
  }

  // Display filtered frames
  phaseFrames.forEach((frame, phaseIndex) => {
    const frameCard = document.createElement("div");
    frameCard.className = "frame-card frame-selector";
    frameCard.dataset.phaseIndex = phaseIndex;
    frameCard.dataset.originalIndex = extractedFrames.findIndex(
      (f) => f.name === frame.name && f.time === frame.time
    );

    const title = document.createElement("div");
    title.className = "frame-title";
    title.textContent = `${frame.name} (${frame.time.toFixed(2)}s)`;

    const canvasContainer = document.createElement("div");
    canvasContainer.className = "frame-canvas-container";

    const canvas = document.createElement("canvas");
    canvas.className = "frame-canvas";
    canvas.width = 200;
    canvas.height = (200 / frame.width) * frame.height;

    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawPoseOnCanvas(frame.landmarks, ctx, canvas.width, canvas.height);
    };
    img.src = frame.imageData;

    canvasContainer.appendChild(canvas);
    frameCard.appendChild(title);
    frameCard.appendChild(canvasContainer);
    frameSelection.appendChild(frameCard);

    // Add click handler
    frameCard.addEventListener("click", () => {
      document.querySelectorAll(".frame-selector").forEach((el) => {
        el.classList.remove("selected");
      });
      frameCard.classList.add("selected");
      selectedFrameForSegment = parseInt(frameCard.dataset.originalIndex);
    });
  });
}

// Update the showSegmentForm function to properly filter frames by phase
function showSegmentForm() {
  const formContainer = document.getElementById("segmentFormContainer");
  formContainer.style.display = "block";

  const frameSelection = document.getElementById("frameSelection");
  frameSelection.innerHTML = "";

  const selectedPhase = document.getElementById("segmentPhase").value;

  // Filter frames by selected phase (case-insensitive match)
  const phaseFrames = extractedFrames.filter((frame) => {
    // Extract phase name from frame name (assuming format "PhaseName FrameNumber")
    const framePhase = frame.name.split(" ")[0].toLowerCase();
    return framePhase === selectedPhase.toLowerCase();
  });

  if (phaseFrames.length === 0) {
    frameSelection.innerHTML = `<p>No frames available for "${selectedPhase}" phase</p>`;
    return;
  }

  // Display filtered frames in the segment form
  phaseFrames.forEach((frame, phaseIndex) => {
    const frameCard = document.createElement("div");
    frameCard.className = "frame-card frame-selector";
    frameCard.dataset.phaseIndex = phaseIndex; // Store the index within the phase
    frameCard.dataset.originalIndex = extractedFrames.findIndex(
      (f) => f.name === frame.name && f.time === frame.time
    ); // Store the original index in extractedFrames

    const title = document.createElement("div");
    title.className = "frame-title";
    title.textContent = `${frame.name} (${frame.time.toFixed(2)}s)`;

    const canvasContainer = document.createElement("div");
    canvasContainer.className = "frame-canvas-container";

    const canvas = document.createElement("canvas");
    canvas.className = "frame-canvas";
    canvas.width = 200;
    canvas.height = (200 / frame.width) * frame.height;

    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawPoseOnCanvas(frame.landmarks, ctx, canvas.width, canvas.height);
    };
    img.src = frame.imageData;

    canvasContainer.appendChild(canvas);
    frameCard.appendChild(title);
    frameCard.appendChild(canvasContainer);
    frameSelection.appendChild(frameCard);

    // Add click handler
    frameCard.addEventListener("click", () => {
      document.querySelectorAll(".frame-selector").forEach((el) => {
        el.classList.remove("selected");
      });
      frameCard.classList.add("selected");
      // Use the original index in extractedFrames
      selectedFrameForSegment = parseInt(frameCard.dataset.originalIndex);
    });
  });
}


function hideSegmentForm() {
  document.getElementById("segmentFormContainer").style.display = "none";
  selectedFrameForSegment = null;
}



function saveSegment() {
  const phase = document.getElementById("segmentPhase").value;
  const feedback = document.getElementById("segmentFeedback").value;

  if (selectedFrameForSegment === null) {
    alert("Please select a frame for this segment");
    return;
  }

  const segment = {
    id: Date.now(),
    phase,
    feedback,
    frameIndex: selectedFrameForSegment,
    thresholds: {},
  };

  segments.push(segment);

  // Also update frameData if you're using it
  if (frameData) {
    const frame = extractedFrames[selectedFrameForSegment];
    frameData.segments.push({
      ...segment,
      frameData: {
        // imageData: frame.imageData,
        landmarks: frame.landmarks,
        // width: frame.width,
        // height: frame.height,
      },
    });
  }

  updateSegmentsList();
  hideSegmentForm();
}


function updateSegmentsList() {
  const container = document.getElementById("segmentsList");
  container.innerHTML = "";

  segments.forEach((segment, index) => {
    const segmentCard = document.createElement("div");
    segmentCard.className = "segment-card";

    const header = document.createElement("div");
    header.className = "segment-header";

    const phase = document.createElement("span");
    phase.className = "segment-phase";
    phase.textContent = segment.phase;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn secondary";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = () => {
      segments.splice(index, 1);
      updateSegmentsList();
    };

    header.appendChild(phase);
    header.appendChild(deleteBtn);

    const frameInfo = document.createElement("p");
    const frame = extractedFrames[segment.frameIndex];
    frameInfo.textContent = `Frame: ${frame.name} (${frame.time.toFixed(2)}s)`;
    frameInfo.className = "frameInfo"
    const feedback = document.createElement("p");
    feedback.textContent = `Feedback: ${segment.feedback}`;
    feedback.className = "feedbackBox"
    const analyzeBtn = document.createElement("button");
    analyzeBtn.className = "btn";
    analyzeBtn.textContent = "Add Thresholds";
    analyzeBtn.onclick = () => analyzeSegment(segment);

    segmentCard.appendChild(header);
    segmentCard.appendChild(frameInfo);
    segmentCard.appendChild(feedback);
    segmentCard.appendChild(analyzeBtn);

    container.appendChild(segmentCard);
  });
}

function analyzeSegment(segment) {
  const frame = extractedFrames[segment.frameIndex];

  // Create or get the analysis container on the main page
  const analysisContainer =
    document.getElementById("segmentAnalysisContainer") ||
    createAnalysisContainer();
  analysisContainer.innerHTML = ""; // Clear previous analysis

  // Create title
  const title = document.createElement("h3");
  title.textContent = `${segment.phase} Analysis - ${
    frame.name
  } Frame (${frame.time.toFixed(2)}s)`;
  analysisContainer.appendChild(title);

  // Create canvas container
  const canvasContainer = document.createElement("div");
  canvasContainer.className = "analysis-canvas-container";

  const canvas = document.createElement("canvas");
  canvas.className = "analysis-canvas";
  canvas.width = 800;
  canvas.height = (800 / frame.width) * frame.height;

  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    drawPoseOnCanvas(frame.landmarks, ctx, canvas.width, canvas.height);
    drawThresholdCircles(
      segment,
      ctx,
      canvas.width,
      canvas.height,
      frame.landmarks
    );
  };
  img.src = frame.imageData;

  canvasContainer.appendChild(canvas);
  analysisContainer.appendChild(canvasContainer);

  // Add keypoint selection dropdown and add button
  const keypointControls = document.createElement("div");
  keypointControls.className = "keypoint-controls";
  keypointControls.style.marginTop = "20px";

  const keypointSelect = document.createElement("select");
  keypointSelect.id = `segment-${segment.id}-keypoint-select`;

  Object.keys(BODY_PARTS).forEach((part) => {
    const option = document.createElement("option");
    option.value = part;
    option.textContent = part;
    keypointSelect.appendChild(option);
  });

  const addKeypointBtn = document.createElement("button");
  addKeypointBtn.className = "btn secondary";
  addKeypointBtn.textContent = "Add Keypoint";
  addKeypointBtn.onclick = () => {
    const selectedPart = keypointSelect.value;
    if (!segment.thresholds) segment.thresholds = {};
    if (!segment.thresholds[selectedPart]) {
      segment.thresholds[selectedPart] = 1.0;
      updateThresholdControls(segment, controlsDiv);
      redrawAnalysisCanvas(canvas, img, frame, segment);
    }
  };

  keypointControls.appendChild(keypointSelect);
  keypointControls.appendChild(addKeypointBtn);
  analysisContainer.appendChild(keypointControls);

  // Threshold controls container
  const controlsDiv = document.createElement("div");
  controlsDiv.className = "segment-threshold-controls";
  controlsDiv.style.marginTop = "20px";
  analysisContainer.appendChild(controlsDiv);

  // Populate controls based on current segment
  updateThresholdControls(segment, controlsDiv);

  // Add close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn secondary";
  closeBtn.textContent = "Save Thresholds";
  closeBtn.style.marginTop = "15px";
  closeBtn.onclick = () => {
    analysisContainer.innerHTML = "";
    analysisContainer.style.display = "none";
  };
  analysisContainer.appendChild(closeBtn);

  // Show the container
  analysisContainer.style.display = "block";
}

function updateThresholdControls(segment, container) {
  container.innerHTML = ""; // Clear existing controls

  const controlsTitle = document.createElement("h4");
  controlsTitle.textContent = "Threshold Settings";
  container.appendChild(controlsTitle);

  Object.keys(segment.thresholds || {}).forEach((part) => {
    const row = document.createElement("div");
    row.className = "threshold-row";

    const label = document.createElement("label");
    label.className = "threshold-label";
    label.textContent = part;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "threshold-slider";
    slider.min = "10";
    slider.max = "100";
    slider.step = "2";
    slider.value = segment.thresholds[part];
    slider.style.width = "200px";

    const value = document.createElement("span");
    value.className = "threshold-value";
    value.textContent = slider.value;

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn secondary remove-threshold";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = () => {
      delete segment.thresholds[part];
      updateThresholdControls(segment, container);
      // Get the current frame and redraw
      const frame = extractedFrames[segment.frameIndex];
      redrawAnalysisCanvas(canvas, img, frame, segment);
    };

    // In the updateThresholdControls function, update the slider event listener:
    slider.addEventListener("input", (e) => {
      value.textContent = e.target.value;
      segment.thresholds[part] = parseFloat(e.target.value);

      // Get the current frame and redraw with updated radius
      const frame = extractedFrames[segment.frameIndex];
      const canvas = document.querySelector(".analysis-canvas");
      if (canvas) {
        const img = new Image();
        img.onload = () => {
          redrawAnalysisCanvas(canvas, img, frame, segment);
        };
        img.src = frame.imageData;
      }
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(value);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}



// Update the redrawAnalysisCanvas function to properly handle radius changes



function addSegmentThresholdControls(segment) {
  const container = document.getElementById("framesPreview");

  // Create threshold controls container
  const controlsDiv = document.createElement("div");
  controlsDiv.className = "threshold-controls";
  controlsDiv.style.marginTop = "20px";

  const title = document.createElement("h3");
  title.textContent = "Segment Threshold Settings";
  controlsDiv.appendChild(title);

  // Add controls for each body part
  const bodyParts = ["leftWrist", "rightWrist", "leftAnkle", "rightAnkle"];

  bodyParts.forEach((part) => {
    const row = document.createElement("div");
    row.className = "threshold-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `segment-${segment.id}-${part}-check`;
    checkbox.className = "threshold-checkbox";
    checkbox.checked = !!segment.thresholds?.[part];

    const label = document.createElement("label");
    label.className = "threshold-label";
    label.textContent = part;
    label.htmlFor = checkbox.id;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = `segment-${segment.id}-${part}-threshold`;
    slider.className = "threshold-slider";
    slider.min = "5";
    slider.max = "20";
    slider.step = "1";
    slider.value = segment.thresholds?.[part] || "10";
    slider.disabled = !checkbox.checked;

    const value = document.createElement("span");
    value.className = "threshold-value";
    value.textContent = slider.value;

    const color = document.createElement("div");
    color.className = "color-indicator";
    color.style.background = THRESHOLD_COLORS[part];

    // Update value display when slider moves
    slider.addEventListener("input", () => {
      value.textContent = slider.value;
      updateSegmentThreshold(
        segment,
        part,
        parseFloat(slider.value),
        checkbox.checked
      );
    });

    checkbox.addEventListener("change", () => {
      slider.disabled = !checkbox.checked;
      updateSegmentThreshold(
        segment,
        part,
        parseFloat(slider.value),
        checkbox.checked
      );
    });

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(value);
    row.appendChild(color);
    controlsDiv.appendChild(row);
  });

  container.appendChild(controlsDiv);
}

// function updateSegmentThreshold(segment, part, value, enabled) {
//   if (!segment.thresholds) {
//     segment.thresholds = {};
//   }

//   if (enabled) {
//     segment.thresholds[part] = value;
//   } else {
//     delete segment.thresholds[part];
//   }

//   // Re-analyze to update visualization
//   analyzeSegment(segment);
// }

// function addSegmentThresholdControls(segment) {
//   const container = document.getElementById("framesPreview");

//   // Create threshold controls container
//   const controlsDiv = document.createElement("div");
//   controlsDiv.className = "threshold-controls";
//   controlsDiv.style.marginTop = "20px";

//   const title = document.createElement("h3");
//   title.textContent = "Segment Threshold Settings";
//   controlsDiv.appendChild(title);

//   // Add controls for each body part
//   const bodyParts = ["leftWrist", "rightWrist", "leftAnkle", "rightAnkle"];

//   bodyParts.forEach((part) => {
//     const row = document.createElement("div");
//     row.className = "threshold-row";

//     const checkbox = document.createElement("input");
//     checkbox.type = "checkbox";
//     checkbox.id = `segment-${segment.id}-${part}-check`;
//     checkbox.className = "threshold-checkbox";
//     checkbox.checked = !!segment.thresholds?.[part];

//     const label = document.createElement("label");
//     label.className = "threshold-label";
//     label.textContent = part;
//     label.htmlFor = checkbox.id;

//     const slider = document.createElement("input");
//     slider.type = "range";
//     slider.id = `segment-${segment.id}-${part}-threshold`;
//     slider.className = "threshold-slider";
//     slider.min = "0.2";
//     slider.max = "2";
//     slider.step = "0.1";
//     slider.value = segment.thresholds?.[part] || "1";
//     slider.disabled = !checkbox.checked;

//     const value = document.createElement("span");
//     value.className = "threshold-value";
//     value.textContent = slider.value;

//     const color = document.createElement("div");
//     color.className = "color-indicator";
//     color.style.background = THRESHOLD_COLORS[part];

//     // Update value display when slider moves
//     slider.addEventListener("input", () => {
//       value.textContent = slider.value;
//       updateSegmentThreshold(
//         segment,
//         part,
//         parseFloat(slider.value),
//         checkbox.checked
//       );
//     });

//     checkbox.addEventListener("change", () => {
//       slider.disabled = !checkbox.checked;
//       updateSegmentThreshold(
//         segment,
//         part,
//         parseFloat(slider.value),
//         checkbox.checked
//       );
//     });

//     row.appendChild(checkbox);
//     row.appendChild(label);
//     row.appendChild(slider);
//     row.appendChild(value);
//     row.appendChild(color);
//     controlsDiv.appendChild(row);
//   });

//   container.appendChild(controlsDiv);
// }

function updateSegmentThreshold(segment, part, value, enabled) {
  if (!segment.thresholds) {
    segment.thresholds = {};
  }

  if (enabled) {
    segment.thresholds[part] = value;
  } else {
    delete segment.thresholds[part];
  }

  // Re-analyze to update visualization
  analyzeSegment(segment);
}



// Setup event listeners
function setupEventListeners() {
  document
    .getElementById("addSegmentBtn")
    .addEventListener("click", showSegmentForm);
  document
    .getElementById("saveSegmentBtn")
    .addEventListener("click", saveSegment);
  document
    .getElementById("cancelSegmentBtn")
      .addEventListener("click", hideSegmentForm);
  
  // Video upload
  document.getElementById('videoUpload').addEventListener('change', handleVideoUpload);
  
  // Controls
  document.getElementById('togglePose').addEventListener('click', togglePoseDetection);
  document.getElementById('extractFrames').addEventListener('click', extractPhaseFrames);
  document.getElementById('saveFrames').addEventListener('click', saveFrameData);
  
  // Threshold controls
  setupThresholdControls();
  
  // Segment phase dropdown listener
  setupSegmentPhaseListener();
  
  // Export buttons
  document.getElementById('exportJson').addEventListener('click', exportAsJson);
  document.getElementById('exportImages').addEventListener('click', exportAsImages);
}



// Setup threshold control listeners
function setupThresholdControls() {
  const bodyParts = ["leftWrist", "rightWrist", "leftAnkle", "rightAnkle"];

  bodyParts.forEach((part) => {
    const checkbox = document.getElementById(part + "Check");
    const slider = document.getElementById(part + "Threshold");
    const valueDisplay = document.getElementById(part + "Value");

    // Only set up listeners if elements exist
    if (checkbox && slider && valueDisplay) {
      // Update value display when slider moves
      slider.addEventListener("input", () => {
        valueDisplay.textContent = slider.value;
        if (frameData) updateThresholdVisualization();
      });

      checkbox.addEventListener("change", () => {
        slider.disabled = !checkbox.checked;
        if (frameData) updateThresholdVisualization();
      });
    }
  });
}

// Handle video upload
function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    videoPlayer = document.getElementById('videoPlayer');
  poseCanvas = document.getElementById('poseCanvas');
  if (!poseCanvas) {
    poseCanvas = document.createElement("canvas");
    poseCanvas.id = "poseCanvas";
    poseCanvas.className = "pose-canvas";
    videoPlayer.parentNode.insertBefore(poseCanvas, videoPlayer.nextSibling);
    // console.error("Pose canvas element not found");
    // return;
  }
    poseCtx = poseCanvas.getContext('2d');
    
    const url = URL.createObjectURL(file);
    videoPlayer.src = url;
    
    videoPlayer.onloadedmetadata = () => {
        videoDuration = videoPlayer.duration;
        setupVideoCanvas();
        document.getElementById('videoSection').style.display = 'block';
        document.getElementById('extractFrames').disabled = false;
        
      // Set default phase ranges
      const phaseTimeRanges = document.getElementById("phaseTimeRanges");
      if (phaseTimeRanges) {
        document.getElementById("startPhaseMin").value = 0;
        document.getElementById("startPhaseMax").value = (
          videoDuration * 0.3
        ).toFixed(1);
        document.getElementById("holdPhaseMin").value = (
          videoDuration * 0.35
        ).toFixed(1);
        document.getElementById("holdPhaseMax").value = (
          videoDuration * 0.65
        ).toFixed(1);
        document.getElementById("endPhaseMin").value = (
          videoDuration * 0.7
        ).toFixed(1);
        document.getElementById("endPhaseMax").value = videoDuration.toFixed(1);
          }
        };
    
    // Video event listeners
    videoPlayer.addEventListener('play', () => {
        if (poseDetectionEnabled) startPoseDetection();
    });
    
    videoPlayer.addEventListener('pause', stopPoseDetection);
    videoPlayer.addEventListener('seeked', () => {
        if (poseDetectionEnabled && videoPlayer.paused) {
            processCurrentFrame();
        }
    });
}

// Setup video canvas
function setupVideoCanvas() {
    const rect = videoPlayer.getBoundingClientRect();
    poseCanvas.width = videoPlayer.videoWidth;
    poseCanvas.height = videoPlayer.videoHeight;
    poseCanvas.style.width = rect.width + 'px';
    poseCanvas.style.height = rect.height + 'px';
}

// Toggle pose detection
function togglePoseDetection() {
    const btn = document.getElementById('togglePose');
    poseDetectionEnabled = !poseDetectionEnabled;
    
    if (poseDetectionEnabled) {
        btn.textContent = 'Disable Pose Detection';
        btn.classList.add('active');
        if (!videoPlayer.paused) startPoseDetection();
    } else {
        btn.textContent = 'Enable Pose Detection';
        btn.classList.remove('active');
        stopPoseDetection();
        clearCanvas();
    }
}

// Start pose detection
function startPoseDetection() {
    if (animationId) return;
    processPoseFrame();
}

// Stop pose detection
function stopPoseDetection() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// Process pose frame
async function processPoseFrame() {
    if (!poseDetectionEnabled || videoPlayer.paused || videoPlayer.ended) {
        animationId = null;
        return;
    }
    
    await processCurrentFrame();
    animationId = requestAnimationFrame(processPoseFrame);
}

// Process current frame
async function processCurrentFrame() {
    if (!videoPlayer) return;
    
    setupVideoCanvas();
    
    try {
        await pose.send({ image: videoPlayer });
    } catch (error) {
        console.error("Pose detection error:", error);
    }
}

// Draw pose landmarks
function drawPose(landmarks) {
    clearCanvas();
    
    if (!landmarks || landmarks.length === 0) return;
    
    const width = poseCanvas.width;
    const height = poseCanvas.height;
    
    // Draw connections
    poseCtx.strokeStyle = '#00FF00';
    poseCtx.lineWidth = 3;
    poseCtx.beginPath();
    
    POSE_CONNECTIONS.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        
        if (startPoint && endPoint && 
            startPoint.visibility > 0.5 && endPoint.visibility > 0.5) {
            poseCtx.moveTo(startPoint.x * width, startPoint.y * height);
            poseCtx.lineTo(endPoint.x * width, endPoint.y * height);
        }
    });
    poseCtx.stroke();
    
    // Draw landmarks
    landmarks.forEach((landmark, index) => {
        if (landmark.visibility > 0.5) {
            const x = landmark.x * width;
            const y = landmark.y * height;
            
            poseCtx.fillStyle = '#0000FF';
            poseCtx.beginPath();
            poseCtx.arc(x, y, 6, 0, 2 * Math.PI);
            poseCtx.fill();
        }
    });
}

// Clear canvas
function clearCanvas() {
    if (poseCtx) {
        poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    }
}

// Extract frames from each phase

async function extractPhaseFrames() {
  if (!videoPlayer) return;

  const phaseRanges = [];
  const phaseRows = document.querySelectorAll("#phaseTimeRanges .phase-row");

  if (phaseRows.length === 0) {
    alert("Please add at least one phase");
    return;
  }

  // Extract phase ranges with validation
  for (const row of phaseRows) {
      const label = row.querySelector(".phase-label")?.textContent || "";
      const phaseName = label.replace(" Phase:", "").trim();

    const minInput = row.querySelector(".range-input:nth-of-type(1)");
    const maxInput = row.querySelector(".range-input:nth-of-type(2)");

    const min = parseFloat(minInput?.value);
    const max = parseFloat(maxInput?.value);

    if (isNaN(min)) {
      alert(`Please enter a valid start time for ${phaseName} phase`);
      return;
    }
    if (isNaN(max)) {
      alert(`Please enter a valid end time for ${phaseName} phase`);
      return;
    }
    if (min >= max) {
      alert(`End time must be after start time for ${phaseName} phase`);
      return;
    }

    phaseRanges.push({ name: phaseName, min, max });
  }

  // Setup UI
  const progressSection = document.getElementById("progressSection");
  const progressFill = document.getElementById("progressFill");
  const statusMessage = document.getElementById("statusMessage");

  if (progressSection) progressSection.style.display = "block";
  if (statusMessage) {
    statusMessage.textContent = "Extracting frames...";
    statusMessage.className = "status-message";
  }

  extractedFrames = [];

  // Frame extraction logic
  for (let i = 0; i < phaseRanges.length; i++) {
    const phase = phaseRanges[i];
    const interval = 0.04; // seconds
    let currentTime = phase.min;
    let frameCount = 1;

    while (currentTime <= phase.max) {
      const progress =
        ((i + (currentTime - phase.min) / (phase.max - phase.min)) /
          phaseRanges.length) *
        100;

      if (progressFill) progressFill.style.width = progress + "%";
      if (statusMessage) {
        statusMessage.textContent = `Extracting ${
          phase.name
        } frame at ${currentTime.toFixed(2)}s...`;
      }

      await seekToTime(currentTime);
      await processCurrentFrame();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const frameData = await captureFrame(
        `${phase.name} Frame ${frameCount}`,
        currentTime
      );
      if (frameData) {
        extractedFrames.push(frameData);
        frameCount++;
      }

      currentTime += interval;
    }
  }

  // Display all extracted frames
  displayExtractedFrames();

  // Update phase dropdown in segment form
  const segmentPhaseDropdown = document.getElementById("segmentPhase");
  segmentPhaseDropdown.innerHTML = "";
  phaseRanges.forEach((phase) => {
    const option = document.createElement("option");
    option.value = phase.name;
    option.textContent = phase.name;
    segmentPhaseDropdown.appendChild(option);
  });

  // Final UI updates
  if (statusMessage) {
    statusMessage.textContent = "Extraction complete!";
    statusMessage.className = "status-message status-success";
  }

  const segmentControls = document.getElementById("segmentControls");
  if (segmentControls) segmentControls.style.display = "block";

  ["saveFrames", "applyThresholds", "exportJson", "exportImages"].forEach(
    (id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = false;
    }
  );

  // Store data for visualization
  window.frameData = {
    timestamp: new Date().toISOString(),
    videoDuration: videoDuration,
    frames: extractedFrames,
  };

  const checkboxes = document.querySelectorAll(".threshold-checkbox");
  checkboxes.forEach((checkbox) => {
    if (checkbox) checkbox.disabled = false;
  });
}


// Seek to specific time
function seekToTime(time) {
    return new Promise(resolve => {
        videoPlayer.onseeked = () => {
            videoPlayer.onseeked = null;
            resolve();
        };
        videoPlayer.currentTime = time;
    });
}

// Capture frame with pose data
async function captureFrame(name, time) {
    if (!currentPoseLandmarks) return null;
    
    // Create canvas for frame capture
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = videoPlayer.videoWidth;
    canvas.height = videoPlayer.videoHeight;
    
    // Draw video frame
    ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
    
    // Get image data
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    
    // Process landmarks
    const landmarks = currentPoseLandmarks.map(lm => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility
    }));
    
    return {
        name: name,
        time: time,
        imageData: imageData,
        landmarks: landmarks,
        width: canvas.width,
        height: canvas.height
    };
}

// Display extracted frames
function displayExtractedFrames() {
  const container = document.getElementById('framesPreview');
  container.innerHTML = '';
  const summaryDiv = document.createElement("div");
  summaryDiv.className = "extraction-summary";
  summaryDiv.innerHTML = `
    <h3>Frame Extraction Complete</h3>
    <p>${extractedFrames.length} frames extracted from ${
    new Set(extractedFrames.map((f) => f.name.split(" ")[0])).size
  } phases</p>
    <p>Use "Add Segment" to select specific frames for analysis.</p>
  `;
  container.appendChild(summaryDiv);
  document.getElementById("segmentControls").style.display = "block";
}


// Draw pose on specific canvas
function drawPoseOnCanvas(landmarks, ctx, width, height) {
  if (!landmarks || landmarks.length === 0) return;

  // Save the current context state
  ctx.save();

  // Draw connections
  ctx.strokeStyle = "#00FF00";
  ctx.lineWidth = 2;
  ctx.beginPath();

  POSE_CONNECTIONS.forEach(([start, end]) => {
    const startPoint = landmarks[start];
    const endPoint = landmarks[end];

    if (
      startPoint &&
      endPoint &&
      startPoint.visibility > 0.5 &&
      endPoint.visibility > 0.5
    ) {
      ctx.moveTo(startPoint.x * width, startPoint.y * height);
      ctx.lineTo(endPoint.x * width, endPoint.y * height);
    }
  });
  ctx.stroke();

  // Draw landmarks
  landmarks.forEach((landmark, index) => {
    if (landmark.visibility > 0.5) {
      const x = landmark.x * width;
      const y = landmark.y * height;

      ctx.fillStyle = "#0000FF";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  });

  // Restore the context state
  ctx.restore();
}

// Save frame data
function saveFrameData() {
  if (segments.length === 0) return;

  const data = {
    timestamp: new Date().toISOString(),
    videoDuration: videoDuration,
    segments: segments.map((segment) => {
      const frame = extractedFrames[segment.frameIndex];
      return {
        phase: segment.phase,
        feedback: segment.feedback,
        time: frame.time,
        thresholds: segment.thresholds || {},
        frameData: {
          // imageData: frame.imageData,
          landmarks: frame.landmarks,
        },
      };
    }),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `pose-segments-${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Show success message
  const statusMessage = document.getElementById("statusMessage");
  statusMessage.textContent = "Segment data saved successfully!";
  statusMessage.className = "status-message status-success";
}

// Update threshold visualization




// Update data preview
function updateDataPreview(activeThresholds) {
  const preview = document.getElementById("dataPreview");
  preview.style.display = "block";

  let previewText = "Active Thresholds:\n";
  Object.keys(activeThresholds).forEach((part) => {
    previewText += `${part}: ${activeThresholds[part]}\n`;
  });

  previewText += "\nFrame Data:\n";
  frameData.frames.forEach((frame) => {
    previewText += `${frame.name} Frame (${frame.time.toFixed(2)}s)\n`;
  });

  preview.textContent = previewText;
}



function exportAsJson() {
  if (segments.length === 0) return;

  // Prepare the data to save - only segments with their associated frame data
  const dataToSave = {
    timestamp: new Date().toISOString(),
    videoDuration: videoDuration,
    segments: segments.map((segment) => {
      const frame = extractedFrames[segment.frameIndex];
      return {
        id: segment.id,
        phase: segment.phase,
        feedback: segment.feedback,
        time: frame.time,
        thresholds: segment.thresholds || {},
        frameData: {
          // imageData: frame.imageData,
          landmarks: frame.landmarks,
          width: frame.width,
          height: frame.height,
        },
      };
    }),
  };

  const blob = new Blob([JSON.stringify(dataToSave, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `pose-segments-${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export as images
function exportAsImages() {
    if (!frameData || frameData.frames.length === 0) return;
    
    // Create a zip file with all images
    alert("This would normally create a ZIP file with all the images. In this demo, it's just a placeholder.");
    
    // In a real implementation, you would use a library like JSZip
    // to create a zip file containing all the frame images
}

// Initialize the application when the page loads
window.addEventListener('DOMContentLoaded', init);


function drawThresholdCircles(segment, ctx, width, height, landmarks) {
  if (!segment.thresholds) return;

  Object.keys(segment.thresholds).forEach((part) => {
    const threshold = segment.thresholds[part];
    const index = BODY_PARTS[part];
    const landmark = landmarks[index];

    if (landmark && landmark.visibility > 0.05) {
      const x = landmark.x * width;
      const y = landmark.y * height;
      const radius = threshold; // direct pixel-based radius

      ctx.strokeStyle = THRESHOLD_COLORS[part];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Add text label
      ctx.fillStyle = "#000";
      ctx.font = "14px Arial";
      ctx.fillText(`${part}: ${threshold.toFixed(2)}`, x + radius + 5, y);
    }
  });
}

function updateThresholdVisualization() {
  if (!frameData) return;

  const container = document.getElementById("framesPreview");
  container.innerHTML = "";

  // Get active thresholds
  const activeThresholds = {};
  const bodyParts = ["leftWrist", "rightWrist", "leftAnkle", "rightAnkle"];

  bodyParts.forEach((part) => {
    const checkbox = document.getElementById(part + "Check");
    if (checkbox && checkbox.checked) {
      const slider = document.getElementById(part + "Threshold");
      if (slider) {
        activeThresholds[part] = parseFloat(slider.value);
      }
    }
  });

  // Display each frame with thresholds
  frameData.frames.forEach((frame) => {
    const frameCard = document.createElement("div");
    frameCard.className = "frame-card";

    const title = document.createElement("div");
    title.className = "frame-title";
    title.textContent = `${frame.name} Frame (${frame.time.toFixed(2)}s)`;

    const canvasContainer = document.createElement("div");
    canvasContainer.className = "frame-canvas-container";

    const canvas = document.createElement("canvas");
    canvas.className = "frame-canvas";
    canvas.width = 400;
    canvas.height = (400 / frame.width) * frame.height;

    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      // Save the current canvas state
      ctx.save();

      // First draw the original image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Then draw the pose landmarks
      drawPoseOnCanvas(frame.landmarks, ctx, canvas.width, canvas.height);

      // Draw the threshold circles (semi-transparent)
      Object.keys(activeThresholds).forEach((part) => {
        const threshold = activeThresholds[part];
        const index = BODY_PARTS[part];

        const landmark = frame.landmarks[index];
        if (landmark && landmark.visibility > 0.05) {
          const x = landmark.x * canvas.width;
          const y = landmark.y * canvas.height;
          const radius = threshold;

          // Set styles for the circle
          ctx.fillStyle = THRESHOLD_COLORS[part];
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI);
          ctx.fill();

          // Reset alpha for text
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = "#000";
          ctx.font = "12px Arial";
          ctx.fillText(`${threshold.toFixed(1)}`, x + radius + 5, y);
        }
      });

      // Restore the canvas state
      ctx.restore();
    };

    img.src = frame.imageData;

    canvasContainer.appendChild(canvas);
    frameCard.appendChild(title);
    frameCard.appendChild(canvasContainer);
    container.appendChild(frameCard);
  });

  updateDataPreview(activeThresholds);
}

function drawThresholdCircles(segment, ctx, width, height, landmarks) {
  if (!segment.thresholds) return;

  Object.keys(segment.thresholds).forEach((part) => {
    const threshold = segment.thresholds[part];
    const index = BODY_PARTS[part];
    const landmark = landmarks[index];

    if (landmark && landmark.visibility > 0.05) {
      const x = landmark.x * width;
      const y = landmark.y * height;
      const radius = threshold * Math.min(width, height) * 0.1; // Make radius proportional to canvas size

      ctx.strokeStyle = THRESHOLD_COLORS[part];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Add text label
      ctx.fillStyle = "#000";
      ctx.font = "14px Arial";
      ctx.fillText(`${part}: ${threshold.toFixed(2)}`, x + radius + 5, y);
    }
  });
}

function createAnalysisContainer() {
  const container = document.createElement("div");
  container.id = "segmentAnalysisContainer";
  container.className = "segment-analysis-container";
  container.style.display = "none";
  container.style.marginTop = "30px";
  container.style.padding = "20px";
  container.style.backgroundColor = "#f5f5f5";
  container.style.borderRadius = "8px";
  container.style.border = "1px solid #ddd";

  // Try different possible parent elements
  const parent =
    document.getElementById("mainContent") ||
    document.getElementById("segmentsList") ||
    document.body;

  parent.appendChild(container);
  return container;
}

function redrawAnalysisCanvas(canvas, img, frame, segment) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawPoseOnCanvas(frame.landmarks, ctx, canvas.width, canvas.height);

  if (segment && segment.thresholds) {
    Object.keys(segment.thresholds).forEach((part) => {
      const threshold = segment.thresholds[part];
      const index = BODY_PARTS[part];
      const landmark = frame.landmarks[index];

      if (landmark && landmark.visibility > 0.05) {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;
        // Calculate radius based on canvas dimensions and threshold value
        const radius = threshold;

        ctx.strokeStyle = THRESHOLD_COLORS[part];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Add text label
        ctx.fillStyle = "#000";
        ctx.font = "14px Arial";
        ctx.fillText(`${part}: ${threshold.toFixed(2)}`, x + radius + 5, y);
      }
    });
  }
}

function drawAnalysisCircles(ctx, width, height, landmarks) {
  // Similar to threshold visualization but with custom logic
  // Example:
  const keyPoints = [
    {
      part: "leftWrist",
      index: BODY_PARTS.leftWrist,
      color: THRESHOLD_COLORS.leftWrist,
    },
    {
      part: "rightWrist",
      index: BODY_PARTS.rightWrist,
      color: THRESHOLD_COLORS.rightWrist,
    },
    // Add more key points as needed
  ];

  keyPoints.forEach((point) => {
    const landmark = landmarks[point.index];
    const slider = document.getElementById(point.part + "Threshold");

    if (landmark && landmark.visibility > 0.05 && slider) {
      const x = landmark.x * width;
      const y = landmark.y * height;
      const radius = parseFloat(slider.value);

      ctx.strokeStyle = point.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Add text label
      ctx.fillStyle = "#000";
      ctx.font = "12px Arial";
      ctx.fillText(`${radius}px`, x + radius + 5, y);
    }
  });
}


