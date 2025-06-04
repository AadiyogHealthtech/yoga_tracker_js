
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

// Body part keypoint indices
// Body part keypoint indices (MediaPipe pose landmarks)
const BODY_PARTS = {
  leftWrist: 15,
  rightWrist: 16,
  leftAnkle: 27,
  rightAnkle: 28,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  // Add more as needed
};

// Threshold colors
const THRESHOLD_COLORS = {
  leftWrist: "rgba(255, 0, 0, 0.3)",
  rightWrist: "rgba(0, 0, 255, 0.3)",
  leftAnkle: "rgba(0, 255, 0, 0.3)",
  rightAnkle: "rgba(255, 255, 0, 0.3)",
  leftShoulder: "rgba(255, 0, 255, 0.3)",
  rightShoulder: "rgba(0, 255, 255, 0.3)",
  // Add more as needed
};

// Initialize the application
async function init() {
    await initializeMediaPipe();
    setupEventListeners();
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


function showSegmentForm() {
  const formContainer = document.getElementById("segmentFormContainer");
  formContainer.style.display = "block";

  // Populate frame selection
  const frameSelection = document.getElementById("frameSelection");
  frameSelection.innerHTML = "";

  // Display all extracted frames in the segment form
  extractedFrames.forEach((frame, index) => {
    const frameCard = document.createElement("div");
    frameCard.className = "frame-card frame-selector";
    frameCard.dataset.index = index;

    const title = document.createElement("div");
    title.className = "frame-title";
    title.textContent = `${frame.name} Frame (${frame.time.toFixed(2)}s)`;

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
      selectedFrameForSegment = index;
    });
  });
}

function hideSegmentForm() {
  document.getElementById("segmentFormContainer").style.display = "none";
  selectedFrameForSegment = null;
}


// function saveSegment() {
//   const phase = document.getElementById("segmentPhase").value;
//   const feedback = document.getElementById("segmentFeedback").value;

//   if (selectedFrameForSegment === null) {
//     alert("Please select a frame for this segment");
//     return;
//   }

//   const segment = {
//     id: Date.now(),
//     phase,
//     feedback,
//     frameIndex: selectedFrameForSegment,
//     thresholds: {}, // Initialize empty thresholds
//   };

//   segments.push(segment);
//   updateSegmentsList();
//   hideSegmentForm();
// }

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
        imageData: frame.imageData,
        landmarks: frame.landmarks,
        width: frame.width,
        height: frame.height,
      },
    });
  }

  updateSegmentsList();
  hideSegmentForm();
}

function drawThresholdCircles(segment, ctx, width, height, landmarks) {
    if (!segment.thresholds) return;
    
    Object.keys(segment.thresholds).forEach(part => {
      const threshold = segment.thresholds[part];
      const index = BODY_PARTS[part];
      const landmark = landmarks[index];
      
      if (landmark && landmark.visibility > 0.05) {
        const x = landmark.x * width;
        const y = landmark.y * height;
        const radius = threshold * 100; // Adjust multiplier as needed
        
        ctx.strokeStyle = THRESHOLD_COLORS[part];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Add text label
        ctx.fillStyle = '#000';
        ctx.font = '14px Arial';
        ctx.fillText(`${part}: ${threshold}`, x + radius + 5, y);
      }
    });
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

    const feedback = document.createElement("p");
    feedback.textContent = `Feedback: ${segment.feedback}`;

    const analyzeBtn = document.createElement("button");
    analyzeBtn.className = "btn";
    analyzeBtn.textContent = "Analyze with Circles";
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

  // Add threshold controls
  const controlsDiv = document.createElement("div");
  controlsDiv.className = "segment-threshold-controls";
  controlsDiv.style.marginTop = "20px";

  const controlsTitle = document.createElement("h4");
  controlsTitle.textContent = "Threshold Settings";
  controlsDiv.appendChild(controlsTitle);

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
    slider.min = "0.2";
    slider.max = "2";
    slider.step = "0.1";
    slider.value = segment.thresholds?.[part] || "1";
    slider.disabled = !checkbox.checked;

    const value = document.createElement("span");
    value.className = "threshold-value";
    value.textContent = slider.value;

    const color = document.createElement("div");
    color.className = "color-indicator";
    color.style.background = THRESHOLD_COLORS[part];

    // Event listeners
    slider.addEventListener("input", () => {
      value.textContent = slider.value;
      updateSegmentThreshold(
        segment,
        part,
        parseFloat(slider.value),
        checkbox.checked
      );
      redrawAnalysisCanvas(canvas, img, frame, segment);
    });

    checkbox.addEventListener("change", () => {
      slider.disabled = !checkbox.checked;
      updateSegmentThreshold(
        segment,
        part,
        parseFloat(slider.value),
        checkbox.checked
      );
      redrawAnalysisCanvas(canvas, img, frame, segment);
    });

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(value);
    row.appendChild(color);
    controlsDiv.appendChild(row);
  });

  analysisContainer.appendChild(controlsDiv);

  // Add close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn secondary";
  closeBtn.textContent = "Close Analysis";
  closeBtn.style.marginTop = "15px";
  closeBtn.onclick = () => {
    analysisContainer.innerHTML = "";
    analysisContainer.style.display = "none";
  };
  analysisContainer.appendChild(closeBtn);

  // Show the container
  analysisContainer.style.display = "block";
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
  drawThresholdCircles(
    segment,
    ctx,
    canvas.width,
    canvas.height,
    frame.landmarks
  );
}

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
    slider.min = "0.2";
    slider.max = "2";
    slider.step = "0.1";
    slider.value = segment.thresholds?.[part] || "1";
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
    if (landmark && landmark.visibility > 0.05) {
      const x = landmark.x * width;
      const y = landmark.y * height;

      // Draw multiple concentric circles
      for (let i = 1; i <= 3; i++) {
        const radius = i * 50; // Adjust as needed
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
    }
  });
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
    
    // Export buttons
    document.getElementById('exportJson').addEventListener('click', exportAsJson);
    document.getElementById('exportImages').addEventListener('click', exportAsImages);
    // document.getElementById('applyThresholds').addEventListener('click', updateThresholdVisualization);
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
    poseCtx = poseCanvas.getContext('2d');
    
    const url = URL.createObjectURL(file);
    videoPlayer.src = url;
    
    videoPlayer.onloadedmetadata = () => {
        videoDuration = videoPlayer.duration;
        setupVideoCanvas();
        document.getElementById('videoSection').style.display = 'block';
        document.getElementById('extractFrames').disabled = false;
        
        // Set default phase ranges
        document.getElementById('startPhaseMin').value = 0;
        document.getElementById('startPhaseMax').value = (videoDuration * 0.3).toFixed(1);
        document.getElementById('holdPhaseMin').value = (videoDuration * 0.35).toFixed(1);
        document.getElementById('holdPhaseMax').value = (videoDuration * 0.65).toFixed(1);
        document.getElementById('endPhaseMin').value = (videoDuration * 0.7).toFixed(1);
        document.getElementById('endPhaseMax').value = videoDuration.toFixed(1);
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

  // Get phase ranges with null checks
  const startMin = parseFloat(document.getElementById("startPhaseMin")?.value);
  const startMax = parseFloat(document.getElementById("startPhaseMax")?.value);
  const holdMin = parseFloat(document.getElementById("holdPhaseMin")?.value);
  const holdMax = parseFloat(document.getElementById("holdPhaseMax")?.value);
  const endMin = parseFloat(document.getElementById("endPhaseMin")?.value);
  const endMax = parseFloat(document.getElementById("endPhaseMax")?.value);

  // Validate ranges
  if (
    isNaN(startMin) ||
    isNaN(startMax) ||
    isNaN(holdMin) ||
    isNaN(holdMax) ||
    isNaN(endMin) ||
    isNaN(endMax)
  ) {
    alert("Please enter valid time ranges for all phases");
    return;
  }

  // Define phase ranges
  const phaseRanges = [
    { name: "Starting", min: startMin, max: startMax },
    { name: "Holding", min: holdMin, max: holdMax },
    { name: "Ending", min: endMin, max: endMax },
  ];

  extractedFrames = [];
  const progressSection = document.getElementById("progressSection");
  const progressFill = document.getElementById("progressFill");
  const statusMessage = document.getElementById("statusMessage");

  if (progressSection) progressSection.style.display = "block";
  if (statusMessage) {
    statusMessage.textContent = "Extracting frames...";
    statusMessage.className = "status-message";
  }

  // Extract multiple frames from each phase (every 0.5 seconds)
  for (let i = 0; i < phaseRanges.length; i++) {
    const phase = phaseRanges[i];
    const interval = 0.5; // seconds between frames
    let currentTime = phase.min;

    while (currentTime <= phase.max) {
      // Update progress
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

      // Seek to position
      await seekToTime(currentTime);

      // Process pose
      await processCurrentFrame();

      // Wait for pose results
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Capture frame
      const frameData = await captureFrame(phase.name, currentTime);
      if (frameData) {
        extractedFrames.push(frameData);
      }

      currentTime += interval;
    }
  }

  if (statusMessage) {
    statusMessage.textContent = "Extraction complete!";
    statusMessage.className = "status-message status-success";
  }

  // displayExtractedFrames();
  document.getElementById("segmentControls").style.display = "block";


  // Add null checks before disabling buttons
  const saveFramesBtn = document.getElementById("saveFrames");
  const applyThresholdsBtn = document.getElementById("applyThresholds");
  const exportJsonBtn = document.getElementById("exportJson");
  const exportImagesBtn = document.getElementById("exportImages");

  if (saveFramesBtn) saveFramesBtn.disabled = false;
  if (applyThresholdsBtn) applyThresholdsBtn.disabled = false;
  if (exportJsonBtn) exportJsonBtn.disabled = false;
  if (exportImagesBtn) exportImagesBtn.disabled = false;

  // Store the data for visualization
  frameData = {
    timestamp: new Date().toISOString(),
    videoDuration: videoDuration,
    segments: [],
  };

  // Enable threshold checkboxes with null checks
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
    
    extractedFrames.forEach(frame => {
        const frameCard = document.createElement('div');
        frameCard.className = 'frame-card';
        
        const title = document.createElement('div');
        title.className = 'frame-title';
        title.textContent = `${frame.name} Frame (${frame.time.toFixed(2)}s)`;
        
        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'frame-canvas-container';
        
        const canvas = document.createElement('canvas');
        canvas.className = 'frame-canvas';
        canvas.width = 400;
        canvas.height = (400 / frame.width) * frame.height;
        
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            drawPoseOnCanvas(frame.landmarks, ctx, canvas.width, canvas.height);
        };
        img.src = frame.imageData;
        
        canvasContainer.appendChild(canvas);
        frameCard.appendChild(title);
        frameCard.appendChild(canvasContainer);
        container.appendChild(frameCard);
    });
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
          imageData: frame.imageData,
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
          const radius = threshold * 50;

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

// Export as JSON
// function exportAsJson() {
//     if (!frameData) return;
    
//     const blob = new Blob([JSON.stringify(frameData, null, 2)], { type: 'application/json' });
//     const url = URL.createObjectURL(blob);
    
//     const a = document.createElement('a');
//     a.href = url;
//     a.download = `pose-analysis-${new Date().toISOString()}.json`;
//     document.body.appendChild(a);
//     a.click();
//     document.body.removeChild(a);
//     URL.revokeObjectURL(url);
// }

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
          imageData: frame.imageData,
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
