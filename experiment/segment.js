document.addEventListener("DOMContentLoaded", async function () {
  const videoPlayer = document.getElementById("videoPlayer");
  clearVideoPlayerOnLoad();
  let segments = [];
  let videoLoaded = false;
  let currentVideoName = "";
  let startFrame = null;
  let endFrame = null;
  let frameRate = null;
  let videoBlobUrl = null;
  let framesData = [];
  let videoDuration = 0;

  const playSegmentButton = document.getElementById("playSegment");
  const processVideoButton = document.getElementById("processVideo");
  const downloadJsonButton = document.getElementById("requestJson");
  const startMarker = document.getElementById("startMarker");
  const endMarker = document.getElementById("endMarker");
  const timeline = document.getElementById("timeline");

  // Checkbox event listeners
  document
    .getElementById("leftHandCheckbox")
    .addEventListener("change", function () {
      document.getElementById("leftHandThreshold").disabled = !this.checked;
    });
  document
    .getElementById("rightHandCheckbox")
    .addEventListener("change", function () {
      document.getElementById("rightHandThreshold").disabled = !this.checked;
    });
  document
    .getElementById("leftLegCheckbox")
    .addEventListener("change", function () {
      document.getElementById("leftLegThreshold").disabled = !this.checked;
    });
  document
    .getElementById("rightLegCheckbox")
    .addEventListener("change", function () {
      document.getElementById("rightLegThreshold").disabled = !this.checked;
    });

  // Initialize MediaPipe Pose
  const pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
  });
  pose.setOptions({
    modelComplexity: 2,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  await pose.initialize();

  // Media picker event listener
  document
    .getElementById("videoPicker")
    .addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (file) {
        loadVideo(file);
      }
    });

  // Draggable markers
  let isDragging = null;
  const timelineWidth = timeline.offsetWidth;
  /**
   * Given a 2D vector [x,y], build the 2×2 rotation matrix that aligns it to +X axis.
   */
  function getRotationMatrix(vec) {
    const theta = Math.atan2(vec[1], vec[0]);
    return [
      [Math.cos(theta), Math.sin(theta)],
      [-Math.sin(theta), Math.cos(theta)],
    ];
  }

  
  function normalizeFrame(landmarks, hipIdx = 23, shoulderIdx = 11) {
    // Convert landmarks to array format (handling objects or arrays)
    const pts = landmarks.map((lm) => {
      if (typeof lm === "object") {
        return [lm.x || 0, lm.y || 0, lm.z || 0];
      } else {
        return [lm[0] || 0, lm[1] || 0, lm[2] || 0];
      }
    });

    // 1. Center at hip joint
    const rawHip = [...pts[hipIdx]];
    const centered = pts.map((p) => [
      p[0] - rawHip[0],
      p[1] - rawHip[1],
      p[2] - rawHip[2],
    ]);

    // 2. Scale by torso length (distance from hip to shoulder in 2D)
    const shoulderVec = [
      centered[shoulderIdx][0],
      centered[shoulderIdx][1], // Use x,y from centered points
    ];

    const normalized = centered.map((p) => [
      p[0], // X remains centered but not scaled
      p[1], // Y remains centered but not scaled
      p[2],
    ]);

    return normalized;
  }

  function updateFrameNumbers() {
    if (!frameRate || !videoDuration) return;

    const totalFrames = Math.floor(videoDuration * frameRate);
    const startPercent = parseFloat(startMarker.style.left || "0");
    const endPercent = parseFloat(endMarker.style.left || "100");

    startFrame = Math.min(
      totalFrames - 1,
      Math.floor((startPercent / 100) * totalFrames)
    );
    endFrame = Math.min(
      totalFrames - 1,
      Math.floor((endPercent / 100) * totalFrames)
    );

    document.querySelector(".start-frame-number").textContent = startFrame;
    document.querySelector(".end-frame-number").textContent = endFrame;
    checkSegmentValidity();
  }

  function checkSegmentValidity() {
    if (startFrame !== null && endFrame !== null && startFrame < endFrame) {
      playSegmentButton.disabled = false;
    } else {
      playSegmentButton.disabled = true;
    }
  }

  startMarker.addEventListener("mousedown", () => (isDragging = "start"));
  endMarker.addEventListener("mousedown", () => (isDragging = "end"));

  document.addEventListener("mousemove", (e) => {
    if (!isDragging || !videoLoaded) return;

    const rect = timeline.getBoundingClientRect();
    let newPos = ((e.clientX - rect.left) / timelineWidth) * 100;

    if (isDragging === "start") {
      newPos = Math.max(
        0,
        Math.min(newPos, parseFloat(endMarker.style.left || "100") - 1)
      );
      startMarker.style.left = `${newPos}%`;
    } else if (isDragging === "end") {
      newPos = Math.min(
        100,
        Math.max(newPos, parseFloat(startMarker.style.left || "0") + 1)
      );
      endMarker.style.left = `${newPos}%`;
    }

    updateFrameNumbers();
  });

  document.addEventListener("mouseup", () => {
    isDragging = null;
  });

  playSegmentButton.addEventListener("click", function () {
    if (startFrame !== null && endFrame !== null) {
      videoPlayer.currentTime = startFrame / frameRate;
      videoPlayer.play();
      setTimeout(() => {
        videoPlayer.pause();
        videoPlayer.currentTime = endFrame / frameRate;
      }, ((endFrame - startFrame) / frameRate) * 1000);
    }
  });

  function updateTotalFramesDisplay() {
    if (frameRate && videoDuration) {
      const totalFrames = Math.floor(videoDuration * frameRate);
      document.getElementById("totalFramesDisplay").textContent = totalFrames;
    }
  }

  function loadVideo(file) {
    // Reset previous video state
    currentVideoName = file.name;
    videoBlobUrl = URL.createObjectURL(file);
    videoPlayer.src = videoBlobUrl;
    videoPlayer.load();
    videoLoaded = true;

    // Reset UI displays
    document.getElementById("frameRateValue").textContent = "--";
    document.getElementById("totalFramesDisplay").textContent = "--";
    document.querySelector(".start-frame-number").textContent = "0";
    document.querySelector(".end-frame-number").textContent = "0";

    // Clear previous markers
    startMarker.style.left = "0%";
    endMarker.style.left = "100%";

    videoPlayer.onloadedmetadata = () => {
      console.log("Video loaded, duration:", videoPlayer.duration);
      videoDuration = videoPlayer.duration;
      updateTotalFramesDisplay(); // Initialize display
      updateFrameNumbers(); // Initialize markers

      // Create temporary video for FPS detection
      const tempVideo = document.createElement("video");
      tempVideo.src = videoBlobUrl;
      tempVideo.muted = true;

      let frameCount = 0;
      let startTime = null;
      let detectionTimeout = null;

      const measureFPS = (now, metadata) => {
        if (startTime === null) {
          startTime = metadata.mediaTime;
        }

        frameCount++;
        const elapsed = metadata.mediaTime - startTime;

        // Minimum 1 second or 60 frames for accurate measurement
        if (elapsed >= 1 || frameCount >= 60) {
          calculateFinalFPS(frameCount, elapsed);
        } else {
          tempVideo.requestVideoFrameCallback(measureFPS);
        }
      };

      const calculateFinalFPS = (count, elapsed) => {
        const fps = Math.round(count / elapsed);
        console.log(
          "Estimated FPS:",
          fps,
          "from",
          count,
          "frames in",
          elapsed,
          "seconds"
        );

        // Validate frame rate
        if (fps < 15 || fps > 120) {
          console.warn("Unusual frame rate detected:", fps);

          // Try alternative detection method
          if (videoDuration > 0) {
            const altFPS =
              Math.round(videoPlayer.videoTracks?.[0]?.frameRate) ||
              Math.round(
                videoPlayer.getVideoPlaybackQuality()?.totalVideoFrames /
                  videoDuration
              ) ||
              30;
            frameRate = Math.max(15, Math.min(60, altFPS));
            console.warn("Using alternative FPS detection:", frameRate);
          } else {
            frameRate = 30; // Default fallback
          }
        } else {
          frameRate = fps;
        }

        // Update UI
        document.getElementById("frameRateValue").textContent = frameRate;
        updateTotalFramesDisplay();
        updateFrameNumbers();

        // Clean up
        clearTimeout(detectionTimeout);
        tempVideo.pause();
        tempVideo.remove();
      };

      // Fallback timeout
      detectionTimeout = setTimeout(() => {
        console.warn("FPS detection timeout, using fallback");
        frameRate = 30;
        document.getElementById("frameRateValue").textContent = "30 (fallback)";
        updateTotalFramesDisplay();
        updateFrameNumbers();
        tempVideo.pause();
        tempVideo.remove();
      }, 5000);

      tempVideo.addEventListener("play", () => {
        tempVideo.requestVideoFrameCallback(measureFPS);
      });

      tempVideo.addEventListener("error", (e) => {
        console.error("Temp video error:", e);
        clearTimeout(detectionTimeout);
        frameRate = 30;
        document.getElementById("frameRateValue").textContent = "30 (fallback)";
        updateTotalFramesDisplay();
        updateFrameNumbers();
      });

      // Start playback for FPS detection
      tempVideo.play().catch((e) => {
        console.error("Temp video play failed:", e);
        clearTimeout(detectionTimeout);
        frameRate = 30;
        document.getElementById("frameRateValue").textContent = "30 (fallback)";
        updateTotalFramesDisplay();
        updateFrameNumbers();
      });
    };

    videoPlayer.onerror = () => {
      console.error("Error loading video");
      alert("Error loading video file. Please try another file.");
    };
  }

  function checkSegmentValidity() {
    if (startFrame !== null && endFrame !== null && startFrame < endFrame) {
      playSegmentButton.disabled = false;
    } else {
      playSegmentButton.disabled = true;
    }
  }

  document
    .getElementById("addNewSegment")
    .addEventListener("click", function () {
      let yogaPhase = document.getElementById("yogaPhase").value.trim();
      let suggestion = document.getElementById("suggestion").value.trim();
      let thresholds = getThresholdValues();

      if (yogaPhase === "") {
        alert("Yoga Phase is required.");
        return;
      }
      if (!thresholds.wholeBody) {
        alert("Whole Body threshold is required.");
        return;
      }

      if (validateSegment(startFrame, endFrame, segments)) {
        segments.push({
          startFrame: startFrame,
          endFrame: endFrame,
          yogaPhase: yogaPhase,
          suggestion: suggestion,
          thresholds: thresholds,
        });
        displaySegments();
        resetSegmentForm();
      } else {
        alert("Invalid segment data.");
      }
    });
  downloadJsonButton.addEventListener("click", function () {
    if (!videoLoaded || framesData.length === 0) {
      alert("Please process a video first.");
      return;
    }

    // Create JSON structure
    const jsonData = {
      video_name: currentVideoName,
      frame_rate: frameRate,
      segments: segments,
      frames: framesData,
    };

    // Create Blob and download
    const jsonString = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentVideoName}_analysis.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  processVideoButton.addEventListener("click", async function () {
    if (!videoLoaded) {
      alert("Please upload a video first.");
      return;
    }
    if (!frameRate) {
      alert(
        "Frame rate not detected yet. Please wait for video to load completely."
      );
      return;
    }
    if (segments.length === 0) {
      alert("Please add at least one segment.");
      return;
    }

    // Show progress element
    const progressElement = document.getElementById("processingProgress");
    const currentFrameSpan = document.getElementById("currentFrame");
    const totalFramesSpan = document.getElementById("totalFrames");
    progressElement.style.display = "block";

    // Calculate total frames
    const totalFrames = Math.ceil(videoDuration * frameRate);
    totalFramesSpan.textContent = totalFrames;
    currentFrameSpan.textContent = "0";

    // Reset frames data
    framesData = [];
    videoPlayer.currentTime = 0;

    // Initialize canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = videoPlayer.videoWidth;
    canvas.height = videoPlayer.videoHeight;

    // Initialize frame counter
    let frameCount = 0;
    let processing = true;

    // Configure pose detection
    pose.onResults((results) => {
      if (!processing) return;

      let frameData;
      if (results.poseLandmarks) {
        frameData = processLandmarks(results.poseLandmarks);
      } else {
        frameData = Array(33 + 4).fill(
          "0.00000000, 0.00000000, 0.00000000, 0.00000000"
        );
      }
      framesData.push(frameData);

      // Update progress
      currentFrameSpan.textContent = frameCount;
      if (frameCount % 5 === 0 || frameCount === totalFrames) {
        const percent = ((frameCount / totalFrames) * 100).toFixed(1);
        progressElement.textContent = `Processing: ${frameCount}/${totalFrames} (${percent}%)`;
      }

      // Process next frame if not finished
      if (frameCount < totalFrames) {
        processNextFrame();
      } else {
        finishProcessing();
      }
    });

    // Pause video and start processing
    videoPlayer.pause();
    videoPlayer.currentTime = 0;

    // Add error handling
    try {
      // Initial frame processing
      await new Promise((resolve) => {
        videoPlayer.onseeked = resolve;
        videoPlayer.currentTime = 0;
      });

      // Start processing loop
      processNextFrame();
    } catch (error) {
      console.error("Processing error:", error);
      progressElement.textContent = `Error: ${error.message}`;
      processing = false;
    }

    async function processNextFrame() {
      if (!processing) return;

      try {
        // Capture frame
        ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Process frame through MediaPipe
        await pose.send({ image: imageData });

        // Queue next frame
        frameCount++;
        if (frameCount < totalFrames) {
          await new Promise((resolve) => {
            videoPlayer.onseeked = resolve;
            videoPlayer.currentTime = frameCount / frameRate;
          });
        }
      } catch (error) {
        console.error("Frame processing error:", error);
        progressElement.textContent = `Error at frame ${frameCount}: ${error.message}`;
        processing = false;
      }
    }

    function finishProcessing() {
      videoPlayer.pause();
      progressElement.textContent = `Processing complete! Processed ${frameCount} frames`;
      setTimeout(() => (progressElement.style.display = "none"), 5000);
      console.log("Finished processing", framesData.length, "frames");
      processing = false;
    }
  });

  function displaySegments() {
    let tableBody = document
      .getElementById("segmentsTable")
      .getElementsByTagName("tbody")[0];
    tableBody.innerHTML = "";

    segments.forEach((segment, index) => {
      let row = tableBody.insertRow();
      row.insertCell(0).innerHTML = index + 1;
      row.insertCell(1).innerHTML = segment.startFrame;
      row.insertCell(2).innerHTML = segment.endFrame;
      row.insertCell(3).innerHTML = segment.yogaPhase;
      row.insertCell(4).innerHTML = segment.suggestion;
      const thresholdsStr = [
        `Whole Body: ${segment.thresholds.wholeBody}`,
        segment.thresholds.leftHand
          ? `Left Hand: ${segment.thresholds.leftHand}`
          : "",
        segment.thresholds.rightHand
          ? `Right Hand: ${segment.thresholds.rightHand}`
          : "",
        segment.thresholds.leftLeg
          ? `Left Leg: ${segment.thresholds.leftLeg}`
          : "",
        segment.thresholds.rightLeg
          ? `Right Leg: ${segment.thresholds.rightLeg}`
          : "",
      ]
        .filter(Boolean)
        .join(", ");
      row.insertCell(5).innerHTML = thresholdsStr;
    });
  }

  function resetSegmentForm() {
    document.getElementById("yogaPhase").value = "";
    document.getElementById("suggestion").value = "";
    document.getElementById("wholeBodyThreshold").value = "";
    document.getElementById("leftHandCheckbox").checked = false;
    document.getElementById("leftHandThreshold").value = "";
    document.getElementById("leftHandThreshold").disabled = true;
    document.getElementById("rightHandCheckbox").checked = false;
    document.getElementById("rightHandThreshold").value = "";
    document.getElementById("rightHandThreshold").disabled = true;
    document.getElementById("leftLegCheckbox").checked = false;
    document.getElementById("leftLegThreshold").value = "";
    document.getElementById("leftLegThreshold").disabled = true;
    document.getElementById("rightLegCheckbox").checked = false;
    document.getElementById("rightLegThreshold").value = "";
    document.getElementById("rightLegThreshold").disabled = true;
    startMarker.style.left = "0%";
    endMarker.style.left = "100%";
    updateFrameNumbers();
  }

  function getThresholdValues() {
    const thresholds = {
      wholeBody:
        document.getElementById("wholeBodyThreshold").value.trim() || null,
      leftHand: document.getElementById("leftHandCheckbox").checked
        ? document.getElementById("leftHandThreshold").value.trim() || "0.0"
        : null,
      rightHand: document.getElementById("rightHandCheckbox").checked
        ? document.getElementById("rightHandThreshold").value.trim() || "0.0"
        : null,
      leftLeg: document.getElementById("leftLegCheckbox").checked
        ? document.getElementById("leftLegThreshold").value.trim() || "0.0"
        : null,
      rightLeg: document.getElementById("rightLegCheckbox").checked
        ? document.getElementById("rightLegThreshold").value.trim() || "0.0"
        : null,
    };
    return thresholds;
  }

  function clearVideoPlayerOnLoad() {
    if (videoPlayer) {
      videoPlayer.src = "";
      videoPlayer.load();
      console.log("Video player cleared on load");
    }
  }

  function validateSegment(start, end, existingSegments) {
    if (start == null || end == null || start >= end) return false;
    for (let segment of existingSegments) {
      if (
        (start >= segment.startFrame && start < segment.endFrame) ||
        (end > segment.startFrame && end <= segment.endFrame)
      ) {
        return false;
      }
    }
    return true;
  }

  function formatFloat(value) {
    return Number(value.toFixed(8)).toString();
  }

  function calculateAngle(p1, p2, p3) {
    const v1 = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
    const v2 = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
    const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
    const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
    const cosineAngle = dot / (mag1 * mag2);
    return (
      (Math.acos(Math.min(Math.max(cosineAngle, -1), 1)) * 180) /
      Math.PI
    ).toFixed(8);
  }

  function processLandmarks(landmarks) {
    // 1) Normalize (translate, scale, rotate) using new normalizeFrame
    const normalized = normalizeFrame(landmarks);
    if (!normalized || normalized.length === 0) return [];

    // 2) Build the per‐frame keypoint list
    const frameKeypoints = [];

    // Push each of the 33 points: "x, y, z, visibility"
    landmarks.forEach((lm, idx) => {
      const x = formatFloat(normalized[idx][0]);
      const y = formatFloat(normalized[idx][1]);
      const z = formatFloat(normalized[idx][2]);
      const visibility = formatFloat(lm.visibility);
      frameKeypoints.push(`${x},${y},${z},${visibility}`);
    });

   
    return frameKeypoints;
  }
});
