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
	[11, 12],
	[11, 13],
	[13, 15],
	[15, 17],
	[15, 19],
	[15, 21],
	[17, 19],
	[12, 14],
	[14, 16],
	[16, 18],
	[16, 20],
	[16, 22],
	[18, 20],
	[11, 23],
	[12, 24],
	[23, 24],
	[23, 25],
	[24, 26],
	[25, 27],
	[26, 28],
	[27, 29],
	[28, 30],
	[29, 31],
	[30, 32],
	[27, 31],
	[28, 32]
];

// Body part keypoint indices (MediaPipe pose landmarks)
const BODY_PARTS = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
};

// Angle calculation joints mapping
const ANGLE_JOINTS = {
    leftElbow: { a: BODY_PARTS.leftWrist, b: BODY_PARTS.leftElbow, c: BODY_PARTS.leftShoulder },
    rightElbow: { a: BODY_PARTS.rightWrist, b: BODY_PARTS.rightElbow, c: BODY_PARTS.rightShoulder },
    leftShoulder: { a: BODY_PARTS.leftElbow, b: BODY_PARTS.leftShoulder, c: BODY_PARTS.leftHip },
    rightShoulder: { a: BODY_PARTS.rightElbow, b: BODY_PARTS.rightShoulder, c: BODY_PARTS.rightHip },
    leftHip: { a: BODY_PARTS.leftShoulder, b: BODY_PARTS.leftHip, c: BODY_PARTS.leftKnee },
    rightHip: { a: BODY_PARTS.rightShoulder, b: BODY_PARTS.rightHip, c: BODY_PARTS.rightKnee },
    leftKnee: { a: BODY_PARTS.leftHip, b: BODY_PARTS.leftKnee, c: BODY_PARTS.leftAnkle },
    rightKnee: { a: BODY_PARTS.rightHip, b: BODY_PARTS.rightKnee, c: BODY_PARTS.rightAnkle }
};

// Default angle tolerance values
const DEFAULT_ANGLE_TOLERANCE = 10;




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
  // Add colors for the remaining landmarks...
};
// Initialize the application
async function init() {
	await initializeMediaPipe();
	setupEventListeners();
	setupPhaseSelection();
	updateExportButtonState();
}

// Initialize MediaPipe Pose
async function initializeMediaPipe() {
	pose = new Pose({
		locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
	});

	pose.setOptions({
		modelComplexity: 2,
		minDetectionConfidence: 0.5,
		minTrackingConfidence: 0.5
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
	const phaseSelect = document.getElementById('phaseSelect');
	const addPhaseBtn = document.getElementById('addPhaseBtn');
	const phaseTimeRanges = document.getElementById('phaseTimeRanges');

	addPhaseBtn.addEventListener('click', () => {
		const selectedPhase = phaseSelect.value.trim();
		if (!selectedPhase) {
			alert('Please select a phase first');
			return;
		}

		// Normalize the base phase name (e.g., remove any trailing numbers or whitespace)
		const basePhaseName = selectedPhase.replace(/\s*\d+$/, '');

		// Get all existing phases and normalize their base names
		const existingPhases = Array.from(document.querySelectorAll('.phase-label')).map((el) =>
			el.textContent.replace(' Phase:', '').trim()
		);

		const samePhases = existingPhases.filter((name) => {
			const base = name.replace(/\s*\d+$/, '').toLowerCase();
			return base === basePhaseName.toLowerCase();
		});

		const phaseNumber = samePhases.length + 1;
		const displayPhaseName = `${basePhaseName} `;
		const phaseId = `${basePhaseName.toLowerCase().replace(/\s+/g, '')}Phase${phaseNumber}`;

		// Create new phase time range inputs
		const phaseDiv = document.createElement('div');
		phaseDiv.className = 'phase-row';
		phaseDiv.innerHTML = `
      <label class="phase-label">${displayPhaseName} Phase: ${phaseNumber}</label>
      <input type="number" id="${phaseId}PhaseMin" class="range-input" placeholder="Start time" min="0" step="0.1">
      <span>to</span>
      <input type="number" id="${phaseId}PhaseMax" class="range-input" placeholder="End time" min="0.1" step="0.1">
      <button class="btn secondary remove-phase" data-phase="${displayPhaseName}">Remove</button>
    `;

		phaseTimeRanges.appendChild(phaseDiv);

		// Add remove button handler
		phaseDiv.querySelector('.remove-phase').addEventListener('click', () => {
			phaseDiv.remove();
		});
	});
}

// Add this function to handle phase dropdown changes in the segment form
function setupSegmentPhaseListener() {
	const segmentPhaseDropdown = document.getElementById('segmentPhase');
	if (segmentPhaseDropdown) {
		segmentPhaseDropdown.addEventListener('change', () => {
			// Clear the current selection
			selectedFrameForSegment = null;
			// Refresh the frame display for the new phase
			const frameSelection = document.getElementById('frameSelection');
			if (frameSelection) {
				showSegmentFramesForCurrentPhase();
			}
		});
	}
}

// Helper function to refresh frames when phase changes

function hideSegmentForm() {
	document.getElementById('segmentFormContainer').style.display = 'none';
	selectedFrameForSegment = null;
}

function saveSegment() {
  const phase = document.getElementById("segmentPhase").value;
  const feedback = document.getElementById("segmentFeedback").value;

  if (selectedFrameForSegment === null) {
    alert("Please select a frame for this segment");
    return;
  }

  // Get the selected frame
  const selectedFrame = extractedFrames[selectedFrameForSegment];

  // Find all frames in the same phase
  const phaseFrames = extractedFrames.filter((frame) =>
    frame.name.startsWith(phase)
  );

  if (phaseFrames.length === 0) {
    alert("No frames found for this phase");
    return;
  }

  // Calculate average frame number for the phase based on time
  const avgTime =
    phaseFrames.reduce((sum, frame) => sum + frame.time, 0) /
    phaseFrames.length;
  const avgFrameNumber = Math.round(avgTime * 30); // Assuming 30 fps

  // Get angle tolerances from UI and update the frame's angleToleranceArray
  const angleTolerances = {};
  Object.keys(ANGLE_JOINTS).forEach((joint) => {
    const toleranceInput = document.getElementById(`${joint}-tolerance`);
    if (toleranceInput) {
      angleTolerances[joint] = parseFloat(toleranceInput.value);
    } else {
      angleTolerances[joint] = DEFAULT_ANGLE_TOLERANCE;
    }
  });

  // Update the selected frame's angleToleranceArray with current tolerance values
  if (selectedFrame.angleToleranceArray) {
    for (let i = 0; i < 33; i++) {
      const jointEntry = Object.entries(ANGLE_JOINTS).find(
        ([jointName, jointDef]) => jointDef.b === i
      );

      if (jointEntry) {
        const [jointName] = jointEntry;
        const currentAngle = selectedFrame.angles[jointName]
          ? selectedFrame.angles[jointName].toFixed(1)
          : "0";
        const tolerance = angleTolerances[jointName] || DEFAULT_ANGLE_TOLERANCE;
        selectedFrame.angleToleranceArray[i] = `${currentAngle},${tolerance}`;
      }
    }
  }

  const segment = {
    id: Date.now(),
    phase,
    feedback,
    frameIndex: selectedFrameForSegment,
    avgFrameNumber: avgFrameNumber,
    thresholds: {},
    angleTolerances: angleTolerances,
  };

  segments.push(segment);

  // Update frameData if needed
  if (frameData) {
    frameData.segments.push({
      ...segment,
      frameData: {
        landmarks: selectedFrame.landmarks,
        angles: selectedFrame.angles,
        angleToleranceArray: selectedFrame.angleToleranceArray,
      },
    });
  }

  updateSegmentsList();
  hideSegmentForm();
  updateExportButtonState();
}

function updateExportButtonState() {
  const exportBtn = document.getElementById("exportJson");
  const tooltip = document.createElement("span");
  tooltip.className = "tooltiptext";
  tooltip.textContent = "Add thresholds to all segments to enable export";

  // Wrap export button in tooltip container if not already
  if (!exportBtn.parentElement.classList.contains("tooltip")) {
    const wrapper = document.createElement("div");
    wrapper.className = "tooltip";
    exportBtn.parentNode.insertBefore(wrapper, exportBtn);
    wrapper.appendChild(exportBtn);
    wrapper.appendChild(tooltip);
  }

  // Check if all segments have at least one threshold
  const allSegmentsHaveThresholds =
    segments.length > 0 &&
    segments.every(
      (segment) =>
        segment.thresholds && Object.keys(segment.thresholds).length > 0
    );

  exportBtn.disabled = !allSegmentsHaveThresholds;
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

    // Add tick mark indicator
    const tickMark = document.createElement("span");
    tickMark.className = "tick-mark";
    tickMark.textContent = "✓";
    tickMark.id = `tick-${segment.id}`;
    if (segment.thresholds && Object.keys(segment.thresholds).length > 0) {
      tickMark.classList.add("visible");
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn secondary";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = () => {
      segments.splice(index, 1);
      updateSegmentsList();
      updateExportButtonState();
    };

    header.appendChild(phase);
    header.appendChild(tickMark);
    header.appendChild(deleteBtn);

    // Show selected frame info
    const selectedFrame = extractedFrames[segment.frameIndex];
    const frameInfo = document.createElement("p");
    frameInfo.textContent = `Selected Frame: ${
      selectedFrame.name
    } (${selectedFrame.time.toFixed(2)}s)`;
    frameInfo.className = "frameInfo";

    // Show average frame info - handle cases where avgFrameNumber might be undefined
    const avgFrameInfo = document.createElement("p");
    const avgFrame =
      segment.avgFrameNumber !== undefined
        ? Math.round(segment.avgFrameNumber)
        : "Not available";
    // avgFrameInfo.textContent = `Phase Average Frame: ${avgFrame}`;
    avgFrameInfo.className = "frameInfo";

    const feedback = document.createElement("p");
    feedback.textContent = `Feedback: ${segment.feedback}`;
    feedback.className = "feedbackBox";

    const analyzeBtn = document.createElement("button");
    analyzeBtn.className = "btn";
    analyzeBtn.textContent = "Add Thresholds";
    analyzeBtn.onclick = () => analyzeSegment(segment);

    segmentCard.appendChild(header);
    segmentCard.appendChild(frameInfo);
    segmentCard.appendChild(avgFrameInfo);
    segmentCard.appendChild(feedback);
    segmentCard.appendChild(analyzeBtn);

    container.appendChild(segmentCard);
  });
  updateExportButtonState();
}

function analyzeSegment(segment) {
  const frame = extractedFrames[segment.frameIndex];

  // Initialize thresholds if they don't exist with default keypoints
  if (!segment.thresholds) {
    segment.thresholds = {};

    // Add default thresholds (shoulders, elbows, hips, knees)
    const defaultParts = [
      "leftShoulder",
      "rightShoulder",
      "leftElbow",
      "rightElbow",
      "leftHip",
      "rightHip",
      "leftKnee",
      "rightKnee",
    ];

    defaultParts.forEach((part) => {
      segment.thresholds[part] = 10; // Default threshold value
    });
  }

  // Initialize angle tolerances if they don't exist
  if (!segment.angleTolerances) {
    segment.angleTolerances = {};
    Object.keys(ANGLE_JOINTS).forEach((joint) => {
      segment.angleTolerances[joint] = DEFAULT_ANGLE_TOLERANCE;
    });
  }

  // Create or get the analysis container
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

  // Add keypoint selection dropdown and buttons
  const keypointControls = document.createElement("div");
  keypointControls.className = "keypoint-controls";
  keypointControls.style.marginTop = "20px";

  const keypointSelect = document.createElement("select");
  keypointSelect.id = `segment-${segment.id}-keypoint-select`;

  // Add all landmarks not already in thresholds to dropdown
  Object.keys(BODY_PARTS).forEach((part) => {
    if (!segment.thresholds[part]) {
      const option = document.createElement("option");
      option.value = part;
      option.textContent = part;
      keypointSelect.appendChild(option);
    }
  });

  // Add "Add All" button
  const addAllBtn = document.createElement("button");
  addAllBtn.className = "btn secondary";
  addAllBtn.textContent = "Add All Keypoints";
  addAllBtn.onclick = () => {
    Object.keys(BODY_PARTS).forEach((part) => {
      if (!segment.thresholds[part]) {
        segment.thresholds[part] = 10; // Default value
      }
    });
    updateThresholdControls(segment, controlsDiv);
    redrawAnalysisCanvas(canvas, img, frame, segment);
    keypointSelect.innerHTML = "";
    updateExportButtonState();
    updateTickMarkVisibility(segment); // Update tick mark after adding all
  };

  const addKeypointBtn = document.createElement("button");
  addKeypointBtn.className = "btn secondary";
  addKeypointBtn.textContent = "Add Keypoint";
  addKeypointBtn.onclick = () => {
    const selectedPart = keypointSelect.value;
    if (!segment.thresholds[selectedPart]) {
      segment.thresholds[selectedPart] = 10; // Default value
      updateThresholdControls(segment, controlsDiv);
      redrawAnalysisCanvas(canvas, img, frame, segment);
      // Remove from dropdown
      keypointSelect.querySelector(`option[value="${selectedPart}"]`)?.remove();
      updateExportButtonState();
    }
  };

  keypointControls.appendChild(keypointSelect);
  keypointControls.appendChild(addKeypointBtn);
  keypointControls.appendChild(addAllBtn);
  analysisContainer.appendChild(keypointControls);

  // Threshold controls container
  const controlsDiv = document.createElement("div");
  controlsDiv.className = "segment-threshold-controls";
  controlsDiv.style.marginTop = "20px";
  analysisContainer.appendChild(controlsDiv);

  // Add angle tolerance controls
  const angleControlsDiv = document.createElement("div");
  angleControlsDiv.className = "angle-controls";
  angleControlsDiv.style.marginTop = "30px";
  angleControlsDiv.style.paddingTop = "20px";
  angleControlsDiv.style.borderTop = "2px solid #ccc";

  const angleTitle = document.createElement("h4");
  angleTitle.textContent = "Angle Tolerance Settings";
  angleControlsDiv.appendChild(angleTitle);

  // Create angle tolerance controls for each joint
  Object.keys(ANGLE_JOINTS).forEach((joint) => {
    const angleRow = document.createElement("div");
    angleRow.className = "angle-row";
    angleRow.style.display = "flex";
    angleRow.style.alignItems = "center";
    angleRow.style.marginBottom = "10px";

    const angleLabel = document.createElement("label");
    angleLabel.className = "angle-label";
    angleLabel.textContent = `${joint} Angle: ${
      frame.angles[joint] ? frame.angles[joint].toFixed(1) + "°" : "N/A"
    }`;
    angleLabel.style.flex = "1";

    const toleranceSlider = document.createElement("input");
    toleranceSlider.type = "range";
    toleranceSlider.min = "0";
    toleranceSlider.max = "45";
    toleranceSlider.step = "1";
    toleranceSlider.value =
      segment.angleTolerances[joint] || DEFAULT_ANGLE_TOLERANCE;
    toleranceSlider.id = `${joint}-tolerance`;
    toleranceSlider.style.flex = "2";
    toleranceSlider.style.margin = "0 15px";

    const toleranceValue = document.createElement("span");
    toleranceValue.className = "tolerance-value";
    toleranceValue.textContent = `±${toleranceSlider.value}°`;
    toleranceValue.style.width = "60px";
    toleranceValue.style.textAlign = "center";

    toleranceSlider.addEventListener("input", () => {
      toleranceValue.textContent = `±${toleranceSlider.value}°`;
      segment.angleTolerances[joint] = parseFloat(toleranceSlider.value);

      // Update the frame's angleToleranceArray
      const frame = extractedFrames[segment.frameIndex];
      if (frame.angleToleranceArray) {
        // Find the landmark index for this joint (the vertex of the angle)
        const jointDef = ANGLE_JOINTS[joint];
        if (jointDef) {
          const landmarkIndex = jointDef.b; // 'b' is the vertex
          const currentAngle = frame.angles[joint]
            ? frame.angles[joint].toFixed(1)
            : "0";
          const newTolerance = toleranceSlider.value;
          frame.angleToleranceArray[
            landmarkIndex
          ] = `${currentAngle},${newTolerance}`;
        }
      }
    });

    angleRow.appendChild(angleLabel);
    angleRow.appendChild(toleranceSlider);
    angleRow.appendChild(toleranceValue);
    angleControlsDiv.appendChild(angleRow);
  });

  analysisContainer.appendChild(angleControlsDiv);

  // Function to update tick mark visibility
  const updateTickMarkVisibility = () => {
    const tickMark = document.getElementById(`tick-${segment.id}`);
    if (tickMark) {
      const hasThresholds =
        segment.thresholds && Object.keys(segment.thresholds).length > 0;
      if (hasThresholds) {
        tickMark.classList.add("visible");
      } else {
        tickMark.classList.remove("visible");
      }
      updateExportButtonState();
    }
  };

  // Custom callback for updateThresholdControls to include tick mark updates
  const updateControlsWithTickMark = (segment, container) => {
    updateThresholdControls(segment, container);

    // Get the master slider after it's created
    const masterSlider = container.querySelector(".master-slider");
    if (masterSlider) {
      masterSlider.addEventListener("input", updateTickMarkVisibility);
    }

    // Add event listeners to all remove buttons
    container.querySelectorAll(".remove-threshold").forEach((btn) => {
      btn.addEventListener("click", () => {
        // Use setTimeout to ensure the threshold is removed before checking
        setTimeout(updateTickMarkVisibility, 0);
      });
    });
  };

  // Populate controls with our enhanced version
  updateControlsWithTickMark(segment, controlsDiv);

  // Add close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn secondary";
  closeBtn.textContent = "Save Thresholds";
  closeBtn.style.marginTop = "15px";
  closeBtn.onclick = () => {
    analysisContainer.innerHTML = "";
    analysisContainer.style.display = "none";
    updateTickMarkVisibility(); // Final update when closing
  };
  analysisContainer.appendChild(closeBtn);

  // Initial update of tick mark
  updateTickMarkVisibility();

  // Show the container
  analysisContainer.style.display = "block";
}

function updateThresholdControls(segment, container) {
  container.innerHTML = ""; // Clear existing controls

  // Add master slider row
  const masterRow = document.createElement("div");
  masterRow.className = "threshold-row master-row";
  masterRow.style.marginBottom = "20px";
  masterRow.style.paddingBottom = "15px";
  masterRow.style.borderBottom = "1px solid #ccc";

  const masterLabel = document.createElement("label");
  masterLabel.className = "threshold-label";
  masterLabel.textContent = "Master Control";
  masterLabel.style.fontWeight = "bold";

  const masterSlider = document.createElement("input");
  masterSlider.type = "range";
  masterSlider.className = "threshold-slider master-slider";
  masterSlider.min = "5";
  masterSlider.max = "50";
  masterSlider.step = "1";
  masterSlider.value = getAverageThreshold(segment.thresholds);
  masterSlider.style.width = "200px";

  const masterValue = document.createElement("span");
  masterValue.className = "threshold-value master-value";
  masterValue.textContent = masterSlider.value;

  masterRow.appendChild(masterLabel);
  masterRow.appendChild(masterSlider);
  masterRow.appendChild(masterValue);
  container.appendChild(masterRow);

  // Add event listener for master slider
  masterSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    masterValue.textContent = value;

    // Update all individual sliders in this segment
    Object.keys(segment.thresholds).forEach((part) => {
      segment.thresholds[part] = value;
    });

    // Update the UI to reflect changes
    updateIndividualSliders(container, value);

    // Redraw the canvas with new thresholds
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

  const controlsTitle = document.createElement("h4");
  controlsTitle.textContent = "Individual Keypoint Settings";
  container.appendChild(controlsTitle);

  // Sort thresholds alphabetically for better organization
  const sortedParts = Object.keys(segment.thresholds || {}).sort();

  sortedParts.forEach((part) => {
    const row = document.createElement("div");
    row.className = "threshold-row";

    const label = document.createElement("label");
    label.className = "threshold-label";
    label.textContent = part;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "threshold-slider";
    slider.min = "5";
    slider.max = "50";
    slider.step = "1";
    slider.value = segment.thresholds[part];
    slider.style.width = "200px";

    const value = document.createElement("span");
    value.className = "threshold-value";
    value.textContent = slider.value;

    const colorIndicator = document.createElement("div");
    colorIndicator.className = "color-indicator";
    colorIndicator.style.backgroundColor = THRESHOLD_COLORS[part] || "#cccccc";
    colorIndicator.style.display = "inline-block";
    colorIndicator.style.width = "15px";
    colorIndicator.style.height = "15px";
    colorIndicator.style.marginLeft = "10px";
    colorIndicator.style.borderRadius = "3px";

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn secondary remove-threshold";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = () => {
      delete segment.thresholds[part];
      updateThresholdControls(segment, container);
		updateExportButtonState();
		
      // Add back to dropdown
      const keypointSelect = document.getElementById(
        `segment-${segment.id}-keypoint-select`
      );
      if (keypointSelect) {
        const option = document.createElement("option");
        option.value = part;
        option.textContent = part;
        keypointSelect.appendChild(option);
      }

      // Redraw canvas
      const frame = extractedFrames[segment.frameIndex];
      const canvas = document.querySelector(".analysis-canvas");
      if (canvas) {
        const img = new Image();
        img.onload = () => {
          redrawAnalysisCanvas(canvas, img, frame, segment);
        };
        img.src = frame.imageData;
      }
    };

    slider.addEventListener("input", (e) => {
      const newValue = parseFloat(e.target.value);
      value.textContent = newValue;
      segment.thresholds[part] = newValue;
	  updateExportButtonState();
      // Update master slider to show average
      masterSlider.value = getAverageThreshold(segment.thresholds);
      masterValue.textContent = masterSlider.value;

      // Redraw canvas
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
    row.appendChild(colorIndicator);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

// Helper function to calculate average threshold for master slider
function getAverageThreshold(thresholds) {
  const values = Object.values(thresholds || {});
  if (values.length === 0) return 10; // Default value

  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / values.length);
}

// Helper function to update all individual sliders when master changes
function updateIndividualSliders(container, value) {
  const sliders = container.querySelectorAll(
    ".threshold-slider:not(.master-slider)"
  );
  const valueDisplays = container.querySelectorAll(
    ".threshold-value:not(.master-value)"
  );

  sliders.forEach((slider) => {
    slider.value = value;
  });

  valueDisplays.forEach((display) => {
    display.textContent = value;
  });
}

// Update the redrawAnalysisCanvas function to properly handle radius changes

function addSegmentThresholdControls(segment) {
	const container = document.getElementById('framesPreview');

	// Create threshold controls container
	const controlsDiv = document.createElement('div');
	controlsDiv.className = 'threshold-controls';
	controlsDiv.style.marginTop = '20px';

	const title = document.createElement('h3');
	title.textContent = 'Segment Threshold Settings';
	controlsDiv.appendChild(title);

	// Add controls for each body part
	const bodyParts = ['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'];

	bodyParts.forEach((part) => {
		const row = document.createElement('div');
		row.className = 'threshold-row';

		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.id = `segment-${segment.id}-${part}-check`;
		checkbox.className = 'threshold-checkbox';
		checkbox.checked = !!segment.thresholds?.[part];

		const label = document.createElement('label');
		label.className = 'threshold-label';
		label.textContent = part;
		label.htmlFor = checkbox.id;

		const slider = document.createElement('input');
		slider.type = 'range';
		slider.id = `segment-${segment.id}-${part}-threshold`;
		slider.className = 'threshold-slider';
		slider.min = '5';
		slider.max = '20';
		slider.step = '1';
		slider.value = segment.thresholds?.[part] || '10';
		slider.disabled = !checkbox.checked;

		const value = document.createElement('span');
		value.className = 'threshold-value';
		value.textContent = slider.value;

		const color = document.createElement('div');
		color.className = 'color-indicator';
		color.style.background = THRESHOLD_COLORS[part];

		// Update value display when slider moves
		slider.addEventListener('input', () => {
			value.textContent = slider.value;
			updateSegmentThreshold(segment, part, parseFloat(slider.value), checkbox.checked);
		});

		checkbox.addEventListener('change', () => {
			slider.disabled = !checkbox.checked;
			updateSegmentThreshold(segment, part, parseFloat(slider.value), checkbox.checked);
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
  document
    .getElementById("videoUpload")
    .addEventListener("change", handleVideoUpload);

  // Controls
  document
    .getElementById("togglePose")
    .addEventListener("click", togglePoseDetection);
  document
    .getElementById("extractFrames")
    .addEventListener("click", extractPhaseFrames);
  document
    .getElementById("saveFrames")
    .addEventListener("click", saveFrameData);

  // Threshold controls
  setupThresholdControls();

  // Segment phase dropdown listener
  setupSegmentPhaseListener();

  // Add dropdown toggle handler
  const dropdownToggle = document.querySelector(".dropdown-toggle");
  if (dropdownToggle) {
    dropdownToggle.addEventListener("click", function () {
      const content = document.querySelector(".dropdown-content");
      const arrow = this.querySelector(".arrow");
      content.classList.toggle("show");
      arrow.classList.toggle("rotate");
    });
  }

  // Export buttons
  document.getElementById("exportJson").addEventListener("click", exportAsJson);
  document
    .getElementById("exportImages")
    .addEventListener("click", exportAsImages);
}

function showSegmentFramesForCurrentPhase() {
  const frameSelection = document.getElementById("frameSelection");
  frameSelection.innerHTML = "";

  // Ensure dropdown is open
  const content = document.querySelector(".dropdown-content");
  const arrow = document.querySelector(".arrow");
  content.classList.add("show");
  arrow.classList.add("rotate");

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

function showSegmentForm() {
  const formContainer = document.getElementById("segmentFormContainer");
  formContainer.style.display = "block";

  // Initialize dropdown state
  const content = document.querySelector(".dropdown-content");
  const arrow = document.querySelector(".arrow");
  content.classList.remove("show");
  arrow.classList.remove("rotate");

  showSegmentFramesForCurrentPhase();
}

// Setup threshold control listeners
function setupThresholdControls() {
	const bodyParts = ['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'];

	bodyParts.forEach((part) => {
		const checkbox = document.getElementById(part + 'Check');
		const slider = document.getElementById(part + 'Threshold');
		const valueDisplay = document.getElementById(part + 'Value');

		// Only set up listeners if elements exist
		if (checkbox && slider && valueDisplay) {
			// Update value display when slider moves
			slider.addEventListener('input', () => {
				valueDisplay.textContent = slider.value;
				if (frameData) updateThresholdVisualization();
			});

			checkbox.addEventListener('change', () => {
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
		poseCanvas = document.createElement('canvas');
		poseCanvas.id = 'poseCanvas';
		poseCanvas.className = 'pose-canvas';
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
		const phaseTimeRanges = document.getElementById('phaseTimeRanges');
		if (phaseTimeRanges) {
			document.getElementById('startPhaseMin').value = 0;
			document.getElementById('startPhaseMax').value = (videoDuration * 0.3).toFixed(1);
			document.getElementById('holdPhaseMin').value = (videoDuration * 0.35).toFixed(1);
			document.getElementById('holdPhaseMax').value = (videoDuration * 0.65).toFixed(1);
			document.getElementById('endPhaseMin').value = (videoDuration * 0.7).toFixed(1);
			document.getElementById('endPhaseMax').value = videoDuration.toFixed(1);
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
		console.error('Pose detection error:', error);
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

		if (startPoint && endPoint && startPoint.visibility > 0.5 && endPoint.visibility > 0.5) {
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
	const phaseRows = document.querySelectorAll('#phaseTimeRanges .phase-row');

	if (phaseRows.length === 0) {
		alert('Please add at least one phase');
		return;
	}

	// Extract phase ranges with validation
	for (const row of phaseRows) {
		const label = row.querySelector('.phase-label')?.textContent || '';
		const phaseName = label.replace(' Phase:', '').trim();

		const minInput = row.querySelector('.range-input:nth-of-type(1)');
		const maxInput = row.querySelector('.range-input:nth-of-type(2)');

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
	const progressSection = document.getElementById('progressSection');
	const progressFill = document.getElementById('progressFill');
	const statusMessage = document.getElementById('statusMessage');

	if (progressSection) progressSection.style.display = 'block';
	if (statusMessage) {
		statusMessage.textContent = 'Extracting frames...';
		statusMessage.className = 'status-message';
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
				((i + (currentTime - phase.min) / (phase.max - phase.min)) / phaseRanges.length) * 100;

			if (progressFill) progressFill.style.width = progress + '%';
			if (statusMessage) {
				statusMessage.textContent = `Extracting ${
					phase.name
				} frame at ${currentTime.toFixed(2)}s...`;
			}

			await seekToTime(currentTime);
			await processCurrentFrame();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const frameData = await captureFrame(`${phase.name} Frame ${frameCount}`, currentTime);
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
	const segmentPhaseDropdown = document.getElementById('segmentPhase');
	segmentPhaseDropdown.innerHTML = '';
	phaseRanges.forEach((phase) => {
		const option = document.createElement('option');
		option.value = phase.name;
		option.textContent = phase.name;
		segmentPhaseDropdown.appendChild(option);
	});

	// Final UI updates
	if (statusMessage) {
		statusMessage.textContent = 'Extraction complete!';
		statusMessage.className = 'status-message status-success';
	}

	const segmentControls = document.getElementById('segmentControls');
	if (segmentControls) segmentControls.style.display = 'block';

	['saveFrames', 'applyThresholds', 'exportJson', 'exportImages'].forEach((id) => {
		const btn = document.getElementById(id);
		if (btn) btn.disabled = false;
	});

	// Store data for visualization
	window.frameData = {
		timestamp: new Date().toISOString(),
		videoDuration: videoDuration,
		frames: extractedFrames
	};

	const checkboxes = document.querySelectorAll('.threshold-checkbox');
	checkboxes.forEach((checkbox) => {
		if (checkbox) checkbox.disabled = false;
	});
}

// Calculate angle between three points (a, b, c where b is the vertex)
function calculateAngle(a, b, c) {
    if (!a || !b || !c) return 0;
    
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    
    const dot = (ab.x * cb.x + ab.y * cb.y);
    const cross = (ab.x * cb.y - ab.y * cb.x);
    
    const angle = Math.atan2(cross, dot) * (180 / Math.PI);
    return Math.abs(angle);
}

// Calculate all angles for a frame
function calculateAllAngles(landmarks) {
    const angles = {};
    
    // Calculate angles for the 8 key joints
    Object.keys(ANGLE_JOINTS).forEach(joint => {
        const { a, b, c } = ANGLE_JOINTS[joint];
        const pointA = landmarks[a];
        const pointB = landmarks[b];
        const pointC = landmarks[c];
        
        if (pointA && pointB && pointC && 
            pointA.visibility > 0.5 && pointB.visibility > 0.5 && pointC.visibility > 0.5) {
            angles[joint] = calculateAngle(pointA, pointB, pointC);
        } else {
            angles[joint] = 0;
        }
    });
    
    // Set other angles to 0
    const allJoints = [
        'nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar',
        'leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle',
        'leftHeel', 'rightHeel', 'leftFootIndex', 'rightFootIndex'
    ];
    
    allJoints.forEach(joint => {
        if (!angles[joint]) {
            angles[joint] = 0;
        }
    });
    
    return angles;
}

// Seek to specific time
function seekToTime(time) {
	return new Promise((resolve) => {
		videoPlayer.onseeked = () => {
			videoPlayer.onseeked = null;
			resolve();
		};
		videoPlayer.currentTime = time;
	});
}

// Capture frame with pose data and angles
async function captureFrame(name, time) {
  if (!currentPoseLandmarks) return null;

  // Create canvas for frame capture
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = videoPlayer.videoWidth;
  canvas.height = videoPlayer.videoHeight;

  // Draw video frame
  ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);

  // Get image data
  const imageData = canvas.toDataURL("image/jpeg", 0.9);

  // Process landmarks
  const landmarks = currentPoseLandmarks.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility,
  }));

  // Calculate angles for this frame
  const angles = calculateAllAngles(landmarks);

  // Create combined angle,tolerance array (33 elements)
  const angleToleranceArray = [];
  for (let i = 0; i < 33; i++) {
    let angle = "0";
    let tolerance = "0";

    // Check if this landmark index corresponds to one of the 8 joints we calculate angles for
    const jointEntry = Object.entries(ANGLE_JOINTS).find(
      ([jointName, jointDef]) => jointDef.b === i // 'b' is the vertex of the angle (the joint itself)
    );

    if (jointEntry) {
      const [jointName] = jointEntry;
      // Use the calculated angle for this joint
      angle = angles[jointName] ? angles[jointName].toFixed(1) : "0";
      tolerance = DEFAULT_ANGLE_TOLERANCE.toString(); // Default tolerance
    }

    // Combine as "angle,tolerance"
    angleToleranceArray.push(`${angle},${tolerance}`);
  }

  return {
    name: name,
    time: time,
    imageData: imageData,
    landmarks: landmarks,
    angles: angles, // Keep original angles object for compatibility
    angleToleranceArray: angleToleranceArray, // New combined array
    width: canvas.width,
    height: canvas.height,
  };
}

// Display extracted frames
function displayExtractedFrames() {
	const container = document.getElementById('framesPreview');
	container.innerHTML = '';
	const summaryDiv = document.createElement('div');
	summaryDiv.className = 'extraction-summary';
	summaryDiv.innerHTML = `
    <h3>Frame Extraction Complete</h3>
    <p>${extractedFrames.length} frames extracted from ${
			new Set(extractedFrames.map((f) => f.name.split(' ')[0])).size
		} phases</p>
    <p>Use "Add Segment" to select specific frames for analysis.</p>
  `;
	container.appendChild(summaryDiv);
	document.getElementById('segmentControls').style.display = 'block';
}

// Draw pose on specific canvas
function drawPoseOnCanvas(landmarks, ctx, width, height) {
	if (!landmarks || landmarks.length === 0) return;

	// Save the current context state
	ctx.save();

	// Draw connections
	ctx.strokeStyle = '#00FF00';
	ctx.lineWidth = 2;
	ctx.beginPath();

	POSE_CONNECTIONS.forEach(([start, end]) => {
		const startPoint = landmarks[start];
		const endPoint = landmarks[end];

		if (startPoint && endPoint && startPoint.visibility > 0.5 && endPoint.visibility > 0.5) {
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

			ctx.fillStyle = '#0000FF';
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
					landmarks: frame.landmarks
				}
			};
		})
	};

	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: 'application/json'
	});
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = `pose-segments-${new Date().toISOString()}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	// Show success message
	const statusMessage = document.getElementById('statusMessage');
	statusMessage.textContent = 'Segment data saved successfully!';
	statusMessage.className = 'status-message status-success';
}

// Update threshold visualization

// Update data preview
function updateDataPreview(activeThresholds) {
	const preview = document.getElementById('dataPreview');
	preview.style.display = 'block';

	let previewText = 'Active Thresholds:\n';
	Object.keys(activeThresholds).forEach((part) => {
		previewText += `${part}: ${activeThresholds[part]}\n`;
	});

	previewText += '\nFrame Data:\n';
	frameData.frames.forEach((frame) => {
		previewText += `${frame.name} Frame (${frame.time.toFixed(2)}s)\n`;
	});

	preview.textContent = previewText;
}

/**
 * Modified exportAsJson() → writes a JSON with the following shape:
 *
 * {
 *   "video_name": "…",
 *   "frame_rate": 30,
 *   "segments": [
 *     [0, 18,    "starting",   [1,1,1],  "right"],
 *     [36, 210,  "transition", [1,1,1],  "right"],
 *     [210, 414, "holding",    [1,1,1],  "right"],
 *     [421, 563, "transition", [1,1,1],  "right"],
 *     [552, 585, "ending",     [1,1,1],  "right"]
 *   ],
 *   "frames": [
 *     [
 *       "-0.03141490,-0.27527460,-0.20251260,0.99991584",
 *       "-0.02736464,-0.29074860,-0.22191689,0.99991381",
 *       … (total 33 strings for frame 0) …
 *     ],
 *     [
 *       "-0.02815047,-0.27623656,-0.19642682,0.99983174",
 *       "-0.02351299,-0.29158057,-0.21631546,0.99982196",
 *       … (total 33 strings for frame 1) …
 *     ],
 *     … etc …
 *   ]
 * }
 *
 * In order to build exactly that shape, do the following:
 *  1.  Grab “video_name” from the upload input’s file name.
 *  2.  Choose a constant “frame_rate” (e.g. 30). If you have access to an actual
 *      frame rate from videoPlayer, you can pull it from there; otherwise you can hard-code 30.
 *  3.  Turn each segment object into an array of five entries:
 *      [ start_frame, end_frame, phase_string, [radii1, radii2, radii3], facing_direction ]
 *      – We assume “start_frame” and “end_frame” here are expressed in frame indices,
 *        so if you know your video is 30 fps, you can multiply seconds→frames. In the example below
 *        I’ve simply rounded seconds×30 to the nearest integer.
 *      – “phase_string” is the same text you already store in `segment.phase`.
 *      – The array of three thresholds ([1,1,1] in your sample) can come from any three body-part thresholds
 *        you want to export. (In this snippet I show how you could take, say,
 *        leftWrist, rightWrist, leftAnkle if those exist in `segment.thresholds`.)
 *      – “facing_direction” is obtained by calling `detectFacing(frame.landmarks)` on the chosen landmark
 *        for that segment. (We pick the segment’s representative frame, e.g. its middle frame.)
 *  4.  Turn each extracted frame’s 33 landmarks (x,y,z,visibility) into a string `"x,y,z,visibility"`, so that
 *      “frames” becomes an array of 33-string arrays.
 *
 * Paste this function into visualizer.js (in place of your old exportAsJson),
 * and then hook up its “Download JSON” button exactly as before.
 */


function calculateNormal(p1, p2, p3) {
	const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
	const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];

	const normal = [
		v1[1] * v2[2] - v1[2] * v2[1],
		v1[2] * v2[0] - v1[0] * v2[2],
		v1[0] * v2[1] - v1[1] * v2[0]
	];

	const normMagnitude = Math.sqrt(normal.reduce((sum, val) => sum + val * val, 0));
	const result = normMagnitude !== 0 ? normal.map((val) => val / normMagnitude) : [0, 0, 0];
	console.log('Calculated normal:', result);
	return result;
}

function detectFacing(landmarks, xThreshold = 0.5, yThreshold = 0.5, zThreshold = 0.5) {
	const normalized = normalizeKeypoints(landmarks);
	const keypoints = normalized[0];
	if (!keypoints) {
		console.warn('No keypoints available for facing detection');
		return 'random';
	}

	const leftShoulder = keypoints[11];
	const rightShoulder = keypoints[12];
	const rightHip = keypoints[24];

	console.log('DetectFacing - Input landmarks sample complete:', landmarks);
	console.log('DetectFacing - Normalized keypoints sample:', keypoints.slice(0, 5));
	console.log('DetectFacing - Left Shoulder:', leftShoulder);
	console.log('DetectFacing - Right Shoulder:', rightShoulder);
	console.log('DetectFacing - Right Hip:', rightHip);

	if (!leftShoulder || !rightShoulder || !rightHip) {
		console.warn('Missing critical keypoints for facing detection');
		return 'random';
	}

	const [nx, ny, nz] = calculateNormal(leftShoulder, rightShoulder, rightHip);
	const absNx = Math.abs(nx),
		absNy = Math.abs(ny),
		absNz = Math.abs(nz);
	console.log('Normal components - nx:', nx, 'ny:', ny, 'nz:', nz);
	console.log('Absolute values - absNx:', absNx, 'absNy:', absNy, 'absNz:', absNz);

	const directions = {
		x: [nx > 0 ? 'left' : 'right', absNx, xThreshold],
		y: [ny > 0 ? 'up' : 'down', absNy, yThreshold],
		z: [nz > 0 ? 'back' : 'front', absNz, zThreshold]
	};

	const [direction, magnitude, threshold] = Object.values(directions).reduce(
		(max, curr) => (curr[1] > max[1] ? curr : max),
		['', -1, 0]
	);
	console.log('its working');
	console.log(
		'Facing detection - Direction:',
		direction,
		'Magnitude:',
		magnitude,
		'Threshold:',
		threshold
	);

	return magnitude > threshold ? direction : 'random';
}

// Make sure normalizeKeypoints is in scope:
function normalizeKeypoints(landmarks) {
	if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 33) {
		console.warn('Invalid landmarks data:', landmarks);
		return null;
	}

	const keypoints = landmarks.map((lm) => {
		if (typeof lm === 'object' && lm.x !== undefined) {
			return [lm.x || 0, lm.y || 0, lm.z || 0];
		}
		return [lm[0] || 0, lm[1] || 0, lm[2] || 0];
	});

	const hip = keypoints[24];
	if (!hip || hip.some((coord) => coord === undefined)) {
		console.warn('Hip keypoint is invalid:', hip);
		return null;
	}

	const normalized = keypoints.map((point) => [
		point[0] - hip[0],
		point[1] - hip[1],
		point[2] - hip[2]
	]);

	// normalized[24] should now be [0,0,0]
	console.log('Normalized keypoints - Hip (should be [0, 0, 0]):', normalized[24]);
	console.log('Normalized keypoints sample:', normalized.slice(0, 5));
	return [normalized, hip];
}

function calculateEuclideanDistance(landmarks, idx1, idx2, imgWidth, imgHeight) {
	// Validate indices
	if (
		!Array.isArray(landmarks) ||
		idx1 < 0 ||
		idx1 >= landmarks.length ||
		idx2 < 0 ||
		idx2 >= landmarks.length
	) {
		console.warn('Invalid landmarks array or indices out of range.');
		return 0;
	}

	// Helper to extract normalized x,y from a single landmark entry
	function getXY(landmark) {
		if (landmark == null) {
			return [0, 0];
		}
		// If it’s an object with {x,y,z}:
		if (typeof landmark === 'object' && 'x' in landmark && 'y' in landmark) {
			return [landmark.x, landmark.y];
		}
		// If it’s an array [x,y,z]:
		if (Array.isArray(landmark) && landmark.length >= 2) {
			return [landmark[0], landmark[1]];
		}
		// Fallback to [0,0]
		return [0, 0];
	}

	// Get normalized coordinates
	const [nx1, ny1] = getXY(landmarks[idx1]);
	const [nx2, ny2] = getXY(landmarks[idx2]);

	// Convert normalized to pixel space
	const x1 = nx1 * imgWidth;
	const y1 = ny1 * imgHeight;
	const x2 = nx2 * imgWidth;
	const y2 = ny2 * imgHeight;

	// Compute Euclidean distance in 2D
	const dx = x2 - x1;
	const dy = y2 - y1;
	return Math.hypot(dx, dy);
}

function cleanName(inputStr) {
	if (typeof inputStr !== 'string') {
		console.warn('cleanName: expected a string, got', inputStr);
		return '';
	}
	const cleaned = inputStr.replace(/\d+/g, '').trim().toLowerCase();
	return cleaned;
}

function exportAsJson() {
  if (segments.length === 0 || !videoPlayer) {
    alert("No segments to export or video not loaded.");
    return;
  }

  // 1) video_name: take the file name from the current <video> src
  const videoUrl = videoPlayer.currentSrc || "";
  const videoName = videoUrl.split("/").pop() || "unknown.mp4";

  // 2) frame_rate: either get from metadata or hard-code
  const frameRate = 25;

  // 3) Build phase ranges from UI inputs
  const phaseRanges = [];
  document.querySelectorAll("#phaseTimeRanges .phase-row").forEach((row) => {
    const label = row.querySelector(".phase-label")?.textContent || "";
    const phaseName = label.replace(" Phase:", "").trim();
    const minInput = row.querySelector(".range-input:nth-of-type(1)");
    const maxInput = row.querySelector(".range-input:nth-of-type(2)");
    const minSec = parseFloat(minInput.value);
    const maxSec = parseFloat(maxInput.value);
    if (!isNaN(minSec) && !isNaN(maxSec) && minSec < maxSec) {
      phaseRanges.push({ name: phaseName, minSec, maxSec });
    }
  });

  // 4) Build the export segments with normalized thresholds
  const exportSegments = segments.map((seg) => {
    const pr = phaseRanges.find((p) => p.name === seg.phase);
    let startFrame, endFrame;

    if (pr) {
      startFrame = Math.round(pr.minSec * frameRate);
      endFrame = Math.round(pr.maxSec * frameRate);
    } else {
      startFrame = seg.frameIndex;
      endFrame = seg.frameIndex;
    }

    const frameObj = extractedFrames[seg.frameIndex];
    const imgW = videoPlayer.videoWidth;
    const imgH = videoPlayer.videoHeight;

    // Calculate distances for all keypoints relative to their respective hips
    const NUM_KEYPOINTS = 33;
    const leftHipIdx = BODY_PARTS.leftHip;
    const thresholds = seg.thresholds || {};

    // 1. start with a zero-filled array of length 33
    const radiiArray = new Array(NUM_KEYPOINTS).fill(0);

    // 2. for each user threshold, look up its keypoint index & compute normalized value
    for (const [kpName, rawThresh] of Object.entries(thresholds)) {
      const kpIndex = BODY_PARTS[kpName];
      if (kpIndex === undefined) continue; // ignore unknown names

      // compute pixel distance from left hip → this keypoint
      const dist = calculateEuclideanDistance(
        frameObj.landmarks,
        leftHipIdx,
        kpIndex,
        imgW,
        imgH
      );

      // avoid divide-by-zero; put result in the exact slot kpIndex
      radiiArray[kpIndex] = dist > 0 ? rawThresh / dist : 0;
    }

    let direction = "random";
    if (frameObj && Array.isArray(frameObj.landmarks)) {
      direction = detectFacing(frameObj.landmarks);
    }
    const phase_name = cleanName(seg.phase);

    // ✅ Calculate representativeFrame safely
    const phaseFrames = extractedFrames.filter((f) =>
      f.name.startsWith(seg.phase)
    );
    const phaseLocalIndex = phaseFrames.findIndex(
      (f) => f.time === extractedFrames[seg.frameIndex].time
    );

    let representativeFrame;
    if (phaseLocalIndex >= 0) {
      representativeFrame = startFrame + phaseLocalIndex;
      representativeFrame = Math.min(representativeFrame, endFrame);
    } else {
      representativeFrame = seg.frameIndex; // fallback
    }

    // Add feedback
    return [
      startFrame,
      endFrame,
      phase_name,
      radiiArray,
      direction,
      {
        representativeFrame,
        angleTolerances: seg.angleTolerances || {},
        feedback: seg.feedback || "", // ✅ added safely
      },
    ];
  });

  // 5) Build "frames" with normalized landmarks and combined angle,tolerance array
  const exportFrames = extractedFrames.map((frame) => {
    const result = normalizeKeypoints(frame.landmarks);

    // Create landmarks array (33 elements)
    let landmarksArray;
    if (!result) {
      landmarksArray = frame.landmarks.map((lm) =>
        [
          lm.x.toFixed(8),
          lm.y.toFixed(8),
          lm.z.toFixed(8),
          lm.visibility.toFixed(8),
        ].join(",")
      );
    } else {
      const [normalizedCoords] = result;
      landmarksArray = normalizedCoords.map((pt, idx) => {
        const vis = frame.landmarks[idx].visibility;
        const [nx, ny, nz] = pt;
        return [
          nx.toFixed(8),
          ny.toFixed(8),
          nz.toFixed(8),
          vis.toFixed(8),
        ].join(",");
      });
    }

    // Use the frame's angleToleranceArray if it exists, otherwise create it
    let angleToleranceArray;
    if (frame.angleToleranceArray) {
      angleToleranceArray = frame.angleToleranceArray;
    } else {
      angleToleranceArray = [];
      for (let i = 0; i < 33; i++) {
        let angle = "0";
        let tolerance = "0";

        const jointEntry = Object.entries(ANGLE_JOINTS).find(
          ([, jointDef]) => jointDef.b === i
        );

        if (jointEntry) {
          const [jointName] = jointEntry;
          angle = frame.angles[jointName]
            ? frame.angles[jointName].toFixed(1)
            : "0";

          // Find tolerance from any segment that uses this frame
          segments.forEach((seg) => {
            const frameIndex = extractedFrames.findIndex(
              (f) => f.name === frame.name && f.time === frame.time
            );
            if (
              frameIndex === seg.frameIndex &&
              seg.angleTolerances &&
              seg.angleTolerances[jointName]
            ) {
              tolerance = seg.angleTolerances[jointName].toString();
            }
          });
        }

        angleToleranceArray.push(`${angle},${tolerance}`);
      }
    }

    return [landmarksArray, angleToleranceArray];
  });

  // Final JSON structure
  const dataToSave = {
    video_name: videoName,
    frame_rate: frameRate,
    segments: exportSegments,
    frames: exportFrames,
  };

  // Download the JSON
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

  // Optional: show a "Saved!" message
  const statusMessage = document.getElementById("statusMessage");
  if (statusMessage) {
    statusMessage.textContent =
      "JSON exported with normalized landmarks, angles, and feedback!";
    statusMessage.className = "status-message status-success";
    setTimeout(() => {
      statusMessage.textContent = "";
      statusMessage.className = "status-message";
    }, 3000);
  }
}

// Export as images
function exportAsImages() {
	if (!frameData || frameData.frames.length === 0) return;

	// Create a zip file with all images
	alert(
		"This would normally create a ZIP file with all the images. In this demo, it's just a placeholder."
	);

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
			ctx.fillStyle = '#000';
			ctx.font = '14px Arial';
			ctx.fillText(`${part}: ${threshold.toFixed(2)}`, x + radius + 5, y);
		}
	});
}

function updateThresholdVisualization() {
	if (!frameData) return;

	const container = document.getElementById('framesPreview');
	container.innerHTML = '';

	// Get active thresholds
	const activeThresholds = {};
	const bodyParts = ['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'];

	bodyParts.forEach((part) => {
		const checkbox = document.getElementById(part + 'Check');
		if (checkbox && checkbox.checked) {
			const slider = document.getElementById(part + 'Threshold');
			if (slider) {
				activeThresholds[part] = parseFloat(slider.value);
			}
		}
	});

	// Display each frame with thresholds
	frameData.frames.forEach((frame) => {
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
					ctx.fillStyle = '#000';
					ctx.font = '12px Arial';
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
			ctx.fillStyle = '#000';
			ctx.font = '14px Arial';
			ctx.fillText(`${part}: ${threshold.toFixed(2)}`, x + radius + 5, y);
		}
	});
}

function createAnalysisContainer() {
	const container = document.createElement('div');
	container.id = 'segmentAnalysisContainer';
	container.className = 'segment-analysis-container';
	container.style.display = 'none';
	container.style.marginTop = '30px';
	container.style.padding = '20px';
	container.style.backgroundColor = '#f5f5f5';
	container.style.borderRadius = '8px';
	container.style.border = '1px solid #ddd';

	// Try different possible parent elements
	const parent =
		document.getElementById('mainContent') ||
		document.getElementById('segmentsList') ||
		document.body;

	parent.appendChild(container);
	return container;
}

function redrawAnalysisCanvas(canvas, img, frame, segment) {
	const ctx = canvas.getContext('2d');
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
				ctx.fillStyle = '#000';
				ctx.font = '14px Arial';
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
			part: 'leftWrist',
			index: BODY_PARTS.leftWrist,
			color: THRESHOLD_COLORS.leftWrist
		},
		{
			part: 'rightWrist',
			index: BODY_PARTS.rightWrist,
			color: THRESHOLD_COLORS.rightWrist
		}
		// Add more key points as needed
	];

	keyPoints.forEach((point) => {
		const landmark = landmarks[point.index];
		const slider = document.getElementById(point.part + 'Threshold');

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
			ctx.fillStyle = '#000';
			ctx.font = '12px Arial';
			ctx.fillText(`${radius}px`, x + radius + 5, y);
		}
	});
}