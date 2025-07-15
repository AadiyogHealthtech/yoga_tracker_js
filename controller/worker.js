
/**
 * Prints text on the canvas at a specified position.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {string} text - The text to display.
 * @param {Object} position - The {x, y} coordinates.
 * @param {string} color - The color in CSS format (e.g., 'green').
 */
export function printTextOnFrame(ctx, text, position = { x: 10, y: 50 }, color = 'red') {
    ctx.font = '20px Helvetica';
    ctx.fillStyle = color;
    ctx.fillText(text, position.x, position.y);
    console.log(`Text drawn: "${text}" at (${position.x}, ${position.y}) in ${color}`);
}
function calculateDtwScore(p1, p2){
    if (!Array.isArray(p1[0])) p1 = [p1];
    if (!Array.isArray(p2[0])) p2 = [p2];
    if (p1.length !== p2.length) {
        throw new Error("Point arrays must be the same length");
    }

    let sum = 0;                              
    const n = p1.length;                        

    for (let i = 0; i < n; i++) {                
        const dx = p2[i][0] - p1[i][0];
        const dy = p2[i][1] - p1[i][1];
        sum += Math.hypot(dx, dy);                 
    }

    return { dtwDistance: sum / n };  
}
function drawFacingFeedback(ctx, detectedDir, requiredDir) {
    /**
     * Draws visual feedback about facing direction on the canvas context.
     * 
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
     * @param {string} detectedDir - Detected direction ("front", "left", "right")
     * @param {string} requiredDir - Required direction for the exercise
     */
    
    // Set font properties (equivalent to OpenCV's 0.7 scale and ~2px thickness)
    ctx.font = '16px Arial';
    
    // Set text alignment baseline
    ctx.textBaseline = 'top';
    
    // Draw detected direction text
    ctx.fillStyle = detectedDir !== requiredDir ? '#FF0000' : '#00FF00'; // Red or Green
    ctx.fillText(`Facing: ${detectedDir}`, 10, 10);
    
    // Draw required direction text (always green)
    ctx.fillStyle = '#00FF00';
    ctx.fillText(`Required: ${requiredDir}`, 10, 40);
}

/**
 * Draws the pose skeleton on the canvas using MediaPipe landmarks.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {Array} landmarks - Array of MediaPipe Pose landmarks.
 */


export function drawPoseSkeleton(ctx, landmarks) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    const POSE_CONNECTIONS = [
        [11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [12, 14], [13, 15], 
        [14, 16], [23, 25], [24, 26], [25, 27], [26, 28]
    ];

    ctx.strokeStyle = 'green';
    ctx.lineWidth = 2;

    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        if (start.visibility > 0.5 && end.visibility > 0.5) {
            ctx.beginPath();
            ctx.moveTo(start.x * width, start.y * height);
            ctx.lineTo(end.x * width, end.y * height);
            ctx.stroke();
        }
    }

    ctx.fillStyle = 'blue';
    landmarks.forEach((landmark) => {
        if (landmark.visibility > 0.5) {
            ctx.beginPath();
            ctx.arc(landmark.x * width, landmark.y * height, 5, 0, 2 * Math.PI);
            ctx.fill();
        }
    });

    console.log('Pose skeleton drawn with', landmarks.length, 'landmarks');
}

/**
 * Draws DTW scores on the canvas in a boxed area.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {Object} scores - Object with phase names as keys and {value, threshold} as values.
 */
export function drawDtwScores(ctx, scores) {
    const height = ctx.canvas.height;
    const yPosStart = height - 150;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, yPosStart - 30, 400, 120);

    ctx.font = '18px Helvetica';
    ctx.fillStyle = 'white';
    ctx.fillText('DTW Scores:', 20, yPosStart);

    let yPos = yPosStart + 30;
    for (const [phase, data] of Object.entries(scores)) {
        const score = data.value;
        const threshold = data.threshold;
        const color = score < threshold ? 'green' : 'red';
        ctx.fillStyle = color;
        ctx.fillText(`${phase}: ${score.toFixed(2)} (th: ${threshold})`, 20, yPos);
        yPos += 30;
    }

    console.log('DTW scores drawn:', scores);
}

/**
 * Draws the ideal transition path and a target circle for the user's wrist.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {Array} idealWristPath - Array of [x, y, z] coordinates or a single [x, y, z] point for the ideal wrist path.
 * @param {Array} userKeypoints - Array of normalized keypoints for the user.
 * @param {number} threshold - Threshold distance for the target circle.
 */
export function drawTransitionPath(ctx, idealWristPath, userKeypoints, threshold) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    if (!userKeypoints || userKeypoints.length < 16) {
        console.warn('User keypoints not available or insufficient');
        return;
    }

    const userWrist = userKeypoints[15]; // LEFT_WRIST
    const userWristPixel = [(userWrist[0] + 1) * width / 2, (userWrist[1] + 1) * height / 2];

    if (!idealWristPath) {
        console.warn('Ideal wrist path is empty or undefined');
        return;
    }

    const targetPoint = Array.isArray(idealWristPath[0]) ? idealWristPath[idealWristPath.length - 1] : idealWristPath;
    const targetPixel = [(targetPoint[0] + 1) * width / 2, (targetPoint[1] + 1) * height / 2];

    let radius = threshold * width / 120;
    if (radius < 5) radius = 5;

    const distance = Math.hypot(userWristPixel[0] - targetPixel[0], userWristPixel[1] - targetPixel[1]);
    const circleColor = distance <= radius ? 'green' : 'red';

    ctx.beginPath();
    ctx.arc(targetPixel[0], targetPixel[1], radius, 0, 2 * Math.PI);
    ctx.strokeStyle = circleColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(userWristPixel[0], userWristPixel[1], 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();

    console.log('Transition path drawn - Target:', targetPixel, 'User wrist:', userWristPixel);
}

/**
 * Draws a guidance arrow from the user's wrist to the ideal wrist position.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {Array} userWrist - Normalized [x, y, z] coordinates of the user's wrist.
 * @param {Array} idealWrist - Normalized [x, y, z] coordinates of the ideal wrist.
 * @param {number} width - Canvas width.
 * @param {number} height - Canvas height.
 * @param {boolean} isSuccess - Whether the pose is correct (determines arrow color).
 */
// export function drawGuidanceArrow(ctx, userWrist, idealWrist, width, height, isSuccess) {
//     if (!userWrist || !idealWrist || userWrist.length < 2 || idealWrist.length < 2) {
//         console.warn('Invalid wrist coordinates for arrow:', { userWrist, idealWrist });
//         return;
//     }

//     const userWristPixel = [(userWrist[0] + 1) * width / 2, (userWrist[1] + 1) * height / 2];
//     const idealWristPixel = [(idealWrist[0] + 1) * width / 2, (idealWrist[1] + 1) * height / 2];

//     // Validate coordinates are within canvas bounds
//     if (userWristPixel[0] < 0 || userWristPixel[0] > width || userWristPixel[1] < 0 || userWristPixel[1] > height ||
//         idealWristPixel[0] < 0 || idealWristPixel[0] > width || idealWristPixel[1] < 0 || idealWristPixel[1] > height) {
//         console.warn('Arrow coordinates out of bounds:', { userWristPixel, idealWristPixel, width, height });
//         return;
//     }

//     ctx.beginPath();
//     ctx.moveTo(userWristPixel[0], userWristPixel[1]);
//     ctx.lineTo(idealWristPixel[0], idealWristPixel[1]);
//     ctx.strokeStyle = isSuccess ? 'green' : 'red';
//     ctx.lineWidth = 3;
//     ctx.stroke();

//     const angle = Math.atan2(idealWristPixel[1] - userWristPixel[1], idealWristPixel[0] - userWristPixel[0]);
//     const arrowSize = 10;
//     ctx.beginPath();
//     ctx.moveTo(idealWristPixel[0], idealWristPixel[1]);
//     ctx.lineTo(
//         idealWristPixel[0] - arrowSize * Math.cos(angle + Math.PI / 6),
//         idealWristPixel[1] - arrowSize * Math.sin(angle + Math.PI / 6)
//     );
//     ctx.moveTo(idealWristPixel[0], idealWristPixel[1]);
//     ctx.lineTo(
//         idealWristPixel[0] - arrowSize * Math.cos(angle - Math.PI / 6),
//         idealWristPixel[1] - arrowSize * Math.sin(angle - Math.PI / 6)
//     );
//     ctx.stroke();

//     console.log(`Arrow drawn from (${userWristPixel[0]}, ${userWristPixel[1]}) to (${idealWristPixel[0]}, ${idealWristPixel[1]})`);
// }
/**
 * Draws an arrow from userWrist → idealWrist.
 * Both wrists are relative to hipPoint (zero-centered).
 * hipPoint, userWrist and idealWrist are all [x,y] in [0…1] space.
 */
export function drawGuidanceArrow(ctx, hipNorm, userRel, idealRel, width, height, isSuccess) {
  // Reconstruct absolute normalized coords [0…1]
  const userNorm  = [ userRel[0]  + hipNorm[0],  userRel[1]  + hipNorm[1] ];
  const idealNorm = [ idealRel[0] + hipNorm[0], idealRel[1] + hipNorm[1] ];

  // Convert to pixel space
  const userPix  = [ userNorm[0]  * width,  userNorm[1]  * height ];
  const idealPix = [ idealNorm[0] * width, idealNorm[1] * height ];

  // Validate
  if (
    userNorm[0] < 0 || userNorm[0] > 1 || userNorm[1] < 0 || userNorm[1] > 1 ||
    idealNorm[0] < 0 || idealNorm[0] > 1 || idealNorm[1] < 0 || idealNorm[1] > 1
  ) {
    console.warn('drawGuidanceArrow: normalized coords out of range', { userNorm, idealNorm });
    return;
  }

  // Draw the shaft
  ctx.beginPath();
  ctx.moveTo(userPix[0], userPix[1]);
  ctx.lineTo(idealPix[0], idealPix[1]);
  ctx.strokeStyle = isSuccess ? 'green' : 'red';
  ctx.lineWidth   = 3;
  ctx.stroke();

  // Draw the head
  const angle     = Math.atan2(idealPix[1] - userPix[1], idealPix[0] - userPix[0]);
  const arrowSize = 10;
  ctx.beginPath();
  // left wing
  ctx.moveTo(idealPix[0], idealPix[1]);
  ctx.lineTo(
    idealPix[0] - arrowSize * Math.cos(angle + Math.PI/6),
    idealPix[1] - arrowSize * Math.sin(angle + Math.PI/6)
  );
  // right wing
  ctx.moveTo(idealPix[0], idealPix[1]);
  ctx.lineTo(
    idealPix[0] - arrowSize * Math.cos(angle - Math.PI/6),
    idealPix[1] - arrowSize * Math.sin(angle - Math.PI/6)
  );
  ctx.stroke();

  console.log(
    `Arrow drawn from (${userPix[0].toFixed(1)},${userPix[1].toFixed(1)}) ` +
    `→ (${idealPix[0].toFixed(1)},${idealPix[1].toFixed(1)})`
  );
}

function drawRelaxationFeedback(ctx, breathingProgress) {
    // Calculate center and animated radius
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const radius = 50 + 20 * Math.sin(breathingProgress);

    // Configure circle style
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#FFA500'; // Orange color (255, 165, 0 in RGB)
    ctx.lineWidth = 3;
    
    // Draw the circle
    ctx.stroke();
    
    return ctx;
}
function drawFacingArrows(ctx, userFacing, targetFacing, position = [50, 30]) {
    const [x, y] = position;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    const arrowColor = '#00FFFF'; // Yellow in hex
    const thickness = 2;

    // Rotation mapping (degrees)
    const rotationMap = {
        'left-front': 180,
        'right-front': 0,
        'back-front': 90,
        'front-left': -90,
        'front-right': 90,
        'left-right': 180,
        'right-left': 180,
        'back-left': -135,
        'back-right': 135
    };

    // Get required rotation
    const key = `${userFacing}-${targetFacing}`;
    let requiredRotation = rotationMap[key] || 0;

    // Text directions
    const directions = {
        0: "Turn right",
        90: "Turn back",
        180: "Turn around",
        '-90': "Turn left",
        135: "Turn back-right",
        '-135': "Turn back-left"
    };

    // Save canvas state
    ctx.save();
    
    // Move to drawing position
    ctx.translate(x, y);
    ctx.rotate(requiredRotation * Math.PI / 180);

    // Draw arrow (triangle)
    ctx.beginPath();
    ctx.moveTo(-25, 50);  // Left point
    ctx.lineTo(25, 50);   // Right point
    ctx.lineTo(0, 0);     // Tip
    ctx.closePath();

    // Style arrow
    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = thickness;
    ctx.stroke();

    // Restore canvas state
    ctx.restore();

    // Draw text
    const text = directions[requiredRotation] || `Face ${targetFacing}`;
    ctx.fillStyle = arrowColor;
    ctx.font = `${thickness * 14}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 80); // Position text below arrow

    return ctx;
}
// camera_utils.js - New drawing functions
export function drawTimeoutProgress(ctx, elapsed, timeout) {
    const width = ctx.canvas.width;
    const progress = elapsed / timeout;
    
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.fillRect(0, 10, width * progress, 5);
}

export function drawPoseMatchIndicator(ctx, distance, threshold) {
    ctx.fillStyle = distance < threshold ? 'green' : 'red';
    ctx.beginPath();
    ctx.arc(30, 30, 20, 0, Math.PI * 2);
    ctx.fill();
}

// In utils/utils.js - Add new function
export function normalizeKeypoints(landmarks) {
    if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 33) {
        console.warn('Invalid landmarks data:', landmarks);
        return null;
    }

    const keypoints = landmarks.map(lm => {
        if (typeof lm === 'object' && lm.x !== undefined) {
            return [lm.x || 0, lm.y || 0, lm.z || 0];
        }
        return [lm[0] || 0, lm[1] || 0, lm[2] || 0];
    });

    const hip = keypoints[24];
    if (!hip || hip.some(coord => coord === undefined)) {
        console.warn('Hip keypoint is invalid:', hip);
        return null;
    }

    const normalized = keypoints.map(point => [
        point[0] - hip[0],
        point[1] - hip[1],
        point[2] - hip[2]
    ]);

    console.log('Normalized keypoints - Hip (should be [0, 0, 0]):', normalized[24]);
    console.log('Normalized keypoints sample:', normalized.slice(0, 5));
    return [normalized, hip];
}

/**
 * Denormalizes a set of keypoints by adding back the hip (root) offset.
 *
 * @param {Array.<[number,number,number]>} normalized 
 *   An array of [x,y,z] triplets that were previously re‑centered so that
 *   the hip (index 24) is at [0,0,0].
 * @param {[number,number,number]} hip
 *   The original hip coordinate [x,y,z] that was subtracted out.
 * @returns {Array.<[number,number,number]>}
 *   The denormalized keypoints in the same format as your original input.
 */
export function denormalizeKeypoints(normalized, hip) {
  if (!Array.isArray(normalized) || normalized.length < 33) {
    console.warn('Invalid normalized data:', normalized);
    return null;
  }
  if (!Array.isArray(hip) || hip.length < 3) {
    console.warn('Invalid hip data:', hip);
    return null;
  }

  return normalized.map(point => [
    (point[0] || 0) + hip[0],
    (point[1] || 0) + hip[1],
    (point[2] || 0) + hip[2]
  ]);
}

export function calculateNormal(p1, p2, p3) {
    const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];

    const normal = [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
    ];

    const normMagnitude = Math.sqrt(normal.reduce((sum, val) => sum + val * val, 0));
    const result = normMagnitude !== 0 ? normal.map(val => val / normMagnitude) : [0, 0, 0];
    console.log('Calculated normal:', result);
    return result;
}





export function detectFacing(landmarks, xThreshold = 0.5, yThreshold = 0.5, zThreshold = 0.5) {
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
    const absNx = Math.abs(nx), absNy = Math.abs(ny), absNz = Math.abs(nz);
    console.log('Normal components - nx:', nx, 'ny:', ny, 'nz:', nz);
    console.log('Absolute values - absNx:', absNx, 'absNy:', absNy, 'absNz:', absNz);

    const directions = {
        'x': [nx > 0 ? 'left' : 'right', absNx, xThreshold],
        'y': [ny > 0 ? 'up' : 'down', absNy, yThreshold],
        'z': [nz > 0 ? 'back' : 'front', absNz, zThreshold]
    };

    const [direction, magnitude, threshold] = Object.values(directions)
        .reduce((max, curr) => curr[1] > max[1] ? curr : max, ['', -1, 0]);
    console.log("its working");
    console.log('Facing detection - Direction:', direction, 'Magnitude:', magnitude, 'Threshold:', threshold);

    
    return magnitude > threshold ? direction : 'random';
}

export function checkKeypointVisibility(landmarks) {
    if (!landmarks || landmarks.length < 33) {
        console.warn('Landmarks incomplete for visibility check:', landmarks);
        return [false, ['all']];
    }
    const missing = [];
    for (let i = 0; i < landmarks.length; i++) {
        if (!landmarks[i].visibility || landmarks[i].visibility < 0.0) {
            missing.push(i);
        }
    }
    console.log('Keypoint visibility - Missing:', missing);
    return [missing.length === 0, missing];
}


export class Controller {
    /**
     * Controller class constructor.
     * Sets up all internal state and loads exercise data for the given plan.
    */
    constructor(exercisePlan) {
        // Log the incoming exercise plan for debugging
        console.log('Constructing Controller with exercise plan:', exercisePlan);
        // Track the timestamp of the last valid pose detection
        // Track the timestamp of the last valid pose detection
        this.lastValidPoseTime = performance.now();

        // Relaxation (rest) state management
        this.inRelaxation = false;           // Are we currently in a relaxation phase?
        this.relaxationEnteredTime = 0;      // When did we enter relaxation?
        this.relaxationThreshold = 5;        // Seconds required to count as a relaxation hold
        this.relaxationSegmentIdx = 0;       // Index of the relaxation segment in the plan

        // Canvas/frame references (injected each frame)
        this.frame = null;                   
        this.results = null;                 // Latest MediaPipe results

        // Store the full exercise plan and initialize pointers
        this.exercisePlan = exercisePlan;    
        this.currentExerciseIdx = 0;         // Index into the list of exercises
        this.exerciseNames = Object.keys(exercisePlan);  // e.g. ['Anuvittasana']
        this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
        this.jsonPath = exercisePlan[this.currentExercise].json_path;  // Path to keypoint JSON
        this.targetReps = exercisePlan[this.currentExercise].reps;     // Repetitions to perform

        // Load exercise data and segment definitions
        this.yoga = new YogaDataExtractor(this.jsonPath);
        this.segments = this.yoga.segments();   // Array of segments (poses/phases)
        this.currentSegmentIdx = 0;             // Which segment we're currently evaluating

        // Handlers for each phase (transition, hold, relaxation, etc.)
        this.phaseHandlers = this._initializeHandlers();

        // Rep counting and timing
        this.count = 0;                         // Completed reps for current exercise
        this.startTime = performance.now();     // When the exercise sequence began
        this.currentRepStartTime = null;        // When the current rep started

        // Pose landmarks and normalization buffers
        this.landmarks = null;
        this.normalized = null;
        this.normalizedKeypoints = null;
        this.hipPoint = 0;                      // Example: used to detect hip position
        this.transitionKeypoints = [];          // Keypoints tracked during transitions

        // Timeouts for each phase to avoid stalling
        this.lastValidHoldTime = 0;             // Last time a hold was detected
        this.phaseTimeouts = {
            transition: 10000,        // Max ms allowed for a transition phase
            holdingAbandonment: 5000, // Max ms to re-enter a hold before abandoning
            holdingDuration: 5000     // Required ms to count a valid hold
        };
        this.lostPoseWarned = false;            // Whether we've warned the user about losing the pose

        // Expert reference keypoints for feedback/comparison
        this.currentExpertKeypoints = null;
        this.lastHoldingIdx = -1;               // Last segment index where hold was detected

        // Analyzer to examine transitions between segments for correctness
        this.transitionAnalyzer = new TransitionAnalyzer(this.jsonPath, this.currentExercise);
    }
    /**
    * Asynchronously load exercise data, initialize segments, phase handlers, and integrate transition analysis.
    */
    async initialize() {
        console.log('Initializing YogaDataExtractor');
        await this.yoga.ensureLoaded();
        console.log("Data loaded and exercise initialized");
        this.segments = this.yoga.segments();
        console.log('Segments initialized:', this.segments);
        if (this.segments.length === 0) {
            console.error('No segments available, exercise cannot start');
            return;
        }
        this.phaseHandlers = this._initializeHandlers();
        console.log('Phase handlers initialized:', Object.keys(this.phaseHandlers));
        integrateWithController(this, this.transitionAnalyzer);
        console.log('Transition analyzer integrated');
    }
    /**
     * Build and return an object mapping each segment to its corresponding phase handler instance.
     * Each handler encapsulates logic for starting, transitioning, holding, ending, or relaxing phases.
     */
    _initializeHandlers() {
        const handlers = {};
        // Iterate over each segment definition loaded from the JSON
        this.segments.forEach((segment, i) => {
            // Extract identifying properties from the segment
            const phase = segment.phase;
            const phaseType = segment.type;
            const uniqueKey = `${phase}_${i}`;
            const startFacing = segment.facing;
            // Choose and instantiate the correct handler class based on segment type
            if (phaseType === 'starting') {
                handlers[uniqueKey] = new StartPhase(this, startFacing);
            } else if (phaseType === 'transition') {
                handlers[uniqueKey] = new TransitionPhase(this , startFacing); // Pass facing
            } else if (phaseType === 'holding') {
                // HoldingPhase receives threshold parameters to determine hold duration
                
                handlers[uniqueKey] = new HoldingPhase(this, segment.thresholds, startFacing); // Add facing
            } else if (phaseType === 'ending') {
                handlers[uniqueKey] = new EndingPhase(this, startFacing);
            }else if (phaseType === 'relaxation') {
                // RelaxationPhase handles rest periods between reps
                handlers[uniqueKey] = new RelaxationPhase(this, startFacing);
            }else if (phaseType === 'relaxation') handlers[uniqueKey] = new RelaxationPhase(this); 
            // Attach the handler key back to the segment for lookup during processing
            segment.handlerKey = uniqueKey;
        });
        return handlers;
    }
    /**
     * Begins the exercise sequence by logging the current exercise name.
     * Can be extended to reset timers, UI state, or trigger the first phase handler.
     */
    startExerciseSequence() {
        console.log(`Starting exercise sequence for ${this.currentExercise}`);
    }
    /**
     * Pushes the latest normalized keypoints and hip position into every phase handler.
     * Ensures each handler has the data it needs before processing.
     */
    update_phase_handlers_frame(){
        // Iterate over each registered phase handler
        for (const handlerKey of Object.keys(this.phaseHandlers)) {
            // Provide the handler with the normalized keypoints (x,y coordinates scaled to frame)
            this.phaseHandlers[handlerKey].normalizedKeypoints = this.normalizedKeypoints;
            // Provide the handler with the hip reference point for orientation or thresholding
            this.phaseHandlers[handlerKey].hipPoint = this.hipPoint;
        }
    }
    /**
     * Called each time MediaPipe Pose produces new results for the current frame.
     * Updates internal landmark buffers, handles lost/regained pose warnings,
     * normalizes keypoints for use by phase handlers, and pushes data to them.
     *
     * @param {PoseResults} results - The output from MediaPipe Pose for the current frame.
     */
    updateFrame(results){
        this.results = results;
        // If there are no results, nothing to process
        if (!results) {
            return;
        }
        // If no landmarks detected, warn once and clear stored keypoints
        if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
            if (!this.lostPoseWarned) {
                console.warn('No pose landmarks detected (first warning)');
                this.lostPoseWarned = true;
            }
            this.landmarks = null;
            this.normalizedKeypoints = null;
            // Propagate cleared data to handlers
            this.update_phase_handlers_frame();
            return;
        }
        // If we had previously lost the pose and now have it back, log recovery
        if (this.lostPoseWarned) {
            console.log('Pose landmarks regained');
            this.lostPoseWarned = false;
        }
        // Store raw pose landmarks for reference or advanced analysis
        this.landmarks = results.poseLandmarks;
        // Check visibility of required keypoints (returns [allVisible, missingList])
        const [allVisible, missing] = checkKeypointVisibility(this.landmarks);

        if (allVisible) {
            // Mark the time of the last valid detection
            this.lastValidPoseTime = performance.now();
            // Normalize keypoints to a consistent coordinate space and compute hip reference
            // Normalize & store keypoints
            [this.normalizedKeypoints, this.hipPoint] = normalizeKeypoints(this.landmarks);
            this.update_phase_handlers_frame();
        } else {
            this.normalizedKeypoints = null;
            console.log(`Missing keypoints: ${missing.join(', ')}`);
        }
        // Still update handlers so they know visibility failed
        this.update_phase_handlers_frame();
    }
    /**
     * checkPhaseTimeouts
     * Enforces time limits on transition and holding phases to prevent stalling.
     *
     * @param {number} currentTime - The current timestamp in milliseconds.
     */
    checkPhaseTimeouts(currentTime) {
        // Get the active segment (phase) definition
        const currentSegment = this.segments[this.currentSegmentIdx];
        // If we're in a transition phase, ensure it doesn't exceed the maximum allowed time
        if (currentSegment.type === 'transition') {
            const elapsed = currentTime - this.startTime;
            if (elapsed > this.phaseTimeouts.transition) {
                console.log('Transition timeout triggered');
                // Reset back to the relaxation segment to let user rest and prepare
                this.currentSegmentIdx = 0; // Return to relaxation
                // Clear any stored keypoints for transition analysis
                this.transitionKeypoints = [];
            }
        }
        // If we're in a holding phase, ensure the user hasn't abandoned the hold
        if (currentSegment.type === 'holding') {
            // If too much time has passed since the last valid hold detection
            if (currentTime - this.lastValidHoldTime > this.phaseTimeouts.holdingAbandonment) {
                console.log('Holding abandonment detected');
                // Return to relaxation segment to allow user to reset
                this.currentSegmentIdx = 0; 
            }
        }
    }
    /**
     * enterRelaxation
     * Switches the controller into a relaxation (rest) phase.
     * Resets timing and segment index to the predefined relaxation segment.
     */
    enterRelaxation() {
        this.inRelaxation = true;
        this.currentSegmentIdx = this.relaxationSegmentIdx;
        this.startTime = performance.now();
    }

    /**
     * Called when a single repetition (rep) of the current exercise is completed.
     * Increments rep count, handles transition to next exercise or workout completion,
     * and then moves into the relaxation (rest) phase.
     *
     * @param {number} currentTime - Timestamp in milliseconds when rep completed
     */
    handleRepCompletion(currentTime) {
        // Increment the completed rep counter
        this.count++;
        // If we've reached or exceeded target reps for this exercise...
        if (this.count >= this.targetReps) {
            // ...and there is another exercise in the plan
            if (this.currentExerciseIdx < this.exerciseNames.length - 1) {
                // Advance to the next exercise
                this.currentExerciseIdx++;
                this.resetForNewExercise();
                // Inform the user via overlay text
                printTextOnFrame(
                    this.frame,
                    `Next Exercise: ${this.currentExercise}`,
                    {x: 10, y: 30},
                    'cyan'
                );
            } else {
                // No more exercises: workout is complete
                printTextOnFrame(
                    this.frame,
                    'Workout Complete!',
                    {x: 10, y: 30},
                    'gold'
                );
            }
        }
        // After finishing (or partially finishing) a rep, enter relaxation/rest
        this.currentSegmentIdx = this.relaxationSegmentIdx;
        this.startTime = currentTime;// Reset phase timer for relaxation
    }
    /**
     * Resets controller state to start tracking a new exercise.
     * Reloads JSON data, segments, handlers, and resets rep counter.
    */
    resetForNewExercise() {
        // Update the current exercise identifiers & targets
        this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
        this.jsonPath = this.exercisePlan[this.currentExercise].json_path;
        this.targetReps = this.exercisePlan[this.currentExercise].reps;
        // Reload exercise data and segment definitions
        this.yoga = new YogaDataExtractor(this.jsonPath);
        this.segments = this.yoga.segments();
        // Rebuild phase handlers for the new exercise
        this.phaseHandlers = this._initializeHandlers();
        console.log(`Phase handlers initialized: ${this.phaseHandlers}`);
        // Reset rep count for the new exercise
        this.count = 0;
    }
    /**
     * Determines whether the controller should switch into a relaxation (rest) phase,
     * based on lost pose, incorrect facing, or timeouts in transition phases.
     *
     * @param {number} currentTime - Current timestamp in milliseconds
     * @returns {boolean} - True if relaxation should be entered
     */
    shouldEnterRelaxation(currentTime) {
        const current = this.segments[this.currentSegmentIdx];
        const elapsed = currentTime - this.lastValidPoseTime;

        // If we haven’t seen a full-body pose in 5s → relax
        if (!this.landmarks && elapsed > this.relaxationThreshold*1000) {
            return true;
        }

        // If we’re in a start/ending phase, only exit when we *know* we’re facing wrong
        if (['starting','ending'].includes(current?.type)) {
        // only try to detect facing if you actually have a normalized keypoint array
            if (this.landmarks) {
                // const target = current.facing || 'front';
                const target = current.facing || 'front';
                console.log(`target facing declared here: ${target}`)
                console.log(`Normalized keypoints testing for facing=${this.normalizedKeypoints}`);
                const facing = detectFacing(this.landmarks);  // Raw landmarks, not normalized
                console.log('code works fine till here')
                if (facing != null && facing !== target) {
                console.log(`Detected facing=${facing}, expected=${target} → relaxing`);
                return true;
                }
            }
        }

        // Transition timeout
        if (current?.type === 'transition' &&
            currentTime - this.startTime > this.phaseTimeouts.transition) {
            return true;
        }

        return false;
    }
    /**
     * Handles the relaxation (rest) phase logic.
     * When called, enters relaxation if not already in it, processes the relaxation phase,
     * and checks exit conditions (either completion or timeout).
     *
     * @param {number} currentTime - Current timestamp in milliseconds
     */
    handleRelaxationPhase(currentTime) {
        // If we haven’t yet flagged that we're in relaxation, initialize it
        if (!this.inRelaxation) {
            this.inRelaxation = true;
            this.relaxationEnteredTime = currentTime;
            console.log("Entering relaxation phase");
        }
        // Create a fresh RelaxationPhase handler for processing this phase
        const handler = new RelaxationPhase(this);
        // Run the relaxation phase logic (e.g., check if user has returned to neutral pose)
        const { phase, completed } = handler.process(currentTime);

        // Exit the relaxation phase when either:
        //  • the handler reports completion (e.g., user is ready to resume), or
        //  • a hard timeout of 30 seconds has elapsed
        if (completed || (currentTime - this.relaxationEnteredTime) > 30000) {
            this.inRelaxation = false;
            this.lastValidPoseTime = currentTime;
            console.log("Exiting relaxation phase");
        }
    }
    /**
     * Provides the values to return from processExercise() when in a relaxation phase.
     *
     * @returns {[string, string, number, number]}
     *   • 'relaxation' – current phase
     *   • this.currentExercise – name of the exercise being rested from
     *   • this.count – how many reps completed so far
     *   • this.targetReps – total reps targeted
     */
    getRelaxationReturnValues() {
        /** Return values when in relaxation phase */
        return [
            'relaxation',
            this.currentExercise,
            this.count,
            this.targetReps
        ];

    }
    // Note: The modified processExercise() method in controller.js should call
    // handleRelaxationPhase() and getRelaxationReturnValues() when shouldEnterRelaxation()
    // returns true, integrating these helpers into the main state machine.

    processExercise(currentTime) {
        // Handle relaxation phase entry
        if (!this.segments || this.segments.length === 0) {
            console.error('No segments loaded!');
            return ['error', '', 0, 0];
        }
        
        if (this.currentSegmentIdx >= this.segments.length) {
            console.warn('Segment index overflow - resetting');
            this.currentSegmentIdx = 0;
        }

        if (this.shouldEnterRelaxation(currentTime)) {
            this.handleRelaxationPhase(currentTime);
            return this.getRelaxationReturnValues();
        }

        // Get current phase handler
        const currentSegment = this.segments[this.currentSegmentIdx];
        const handler = this.phaseHandlers[currentSegment.handlerKey];
        
        // Process current phase
        const [phase, completed] = handler.process(currentTime);
        // Add after [phase, completed] = handler.process(currentTime):

        // Draw path for transitions
        if (currentSegment.type === 'transition' && this.normalizedKeypoints) {
            this.transitionKeypoints.push(this.normalizedKeypoints);
            drawTransitionPath(
                this.frame,
                this.transitionAnalyzer.getTransitionEndTarget(this.currentSegmentIdx),
                this.normalizedKeypoints,
                0.1
            );
        }

        // Draw skeleton for non-transitions
        if (this.landmarks && currentSegment.type !== 'transition') {
            drawPoseSkeleton(this.frame, this.landmarks);
        }

        // Holding phase visualization
        if (currentSegment.type === 'holding' && this.normalizedKeypoints) {
            const idealKeypoints = this.getIdealKeypoints(currentSegment.phase);
            if (idealKeypoints.length) {
                const dtwResult = calculateDtwScore(idealKeypoints, this.normalizedKeypoints);
                if (dtwResult?.dtwDistance !== undefined) {
                    drawDtwScores(this.frame, {
                        [currentSegment.phase]: {
                            value: dtwResult.dtwDistance,
                            threshold: currentSegment.thresholds[0]
                        }
                    });
                    
                    const hipNorm     = this.hipPoint;              
                    const userRel     = this.normalizedKeypoints[15]; 
                    const idealRel    = idealKeypoints[15];                   
                    const canvasW     = this.frame.canvas.width;
                    const canvasH     = this.frame.canvas.height;
                    const isSuccess   = (dtwResult.dtwDistance < currentSegment.thresholds[0]);

                    drawGuidanceArrow(
                        this.frame,
                        hipNorm,
                        userRel,
                        idealRel,
                        canvasW,
                        canvasH,
                        isSuccess
                    );

                }
            }
        }
        // Phase transition logic
        if (completed) {
            if (currentSegment.type === 'starting') {
                // Starting phase completed, move to transition
                this.currentSegmentIdx++;
                this.startTime = currentTime;
            } 
            else if (currentSegment.type === 'transition') {
                // Transition phase timeout handling
                if (currentTime - this.startTime > 10000) { // 10 second timeout
                    this.currentSegmentIdx = 0; // Back to relaxation
                    console.log('Transition timeout - returning to relaxation');
                } else {
                    this.currentSegmentIdx++; // Proceed to holding
                    this.startTime = currentTime;
                }
            }
            else if (currentSegment.type === 'holding') {
                // Start monitoring for abandonment
                const newIdx = this.currentSegmentIdx + 1;
                this.currentSegmentIdx = newIdx;
                this.startTime = currentTime;

                const nextSeg = this.segments[newIdx];
                if (nextSeg.type === 'holding') {
                this.phaseHandlers[nextSeg.handlerKey]._resetTimers();
                }
            }
            else if (currentSegment.type === 'ending') {
                // Rep completion logic
                this.handleRepCompletion(currentTime);
                this.currentSegmentIdx = this.relaxationSegmentIdx;
            }
        }

        // Check for holding phase abandonment
        if (currentSegment.type === 'holding' && 
            currentTime - this.lastValidHoldTime > 5000) {
            console.log('Holding phase abandoned - returning to relaxation');
            this.currentSegmentIdx = 0;
        }

        return [phase, this.currentExercise, this.count, this.targetReps];
    }

    getIdealKeypoints(phase) {
        const segment = this.segments[this.currentSegmentIdx];
        if (segment.phase === phase) {
            const middle = Math.floor((segment.start + segment.end) / 2);
            return this.yoga.getIdealKeypoints(middle, middle + 1)[0] || [];
        }
        return [];
    }
    getNextIdealKeypoints(phase, segmentidx){
        const segment = this.segments[segmentidx];
        const middle = Math.floor((segment.start + segment.end) / 2);
        return this.yoga.getIdealKeypoints(middle, middle + 1)[0] || [];
        
    }


    getTransitionKeypoints(startIdx, endIdx) {
        for (let i = startIdx; i < endIdx; i++) {
            if (this.segments[i].type === 'transition') {
                return this.yoga.getIdealKeypoints(this.segments[i].start, this.segments[i].end);
            }
        }
        return [];
    }
}



/**
 * YogaDataExtractor
 * Fetches a JSON file containing keypoint frames and segment definitions,
 * and exposes methods to retrieve segments and ideal keypoints for analysis.
 */
export class YogaDataExtractor {
    /**
     * @param {string} jsonPath - URL or relative path to the exercise keypoints JSON
     */
    constructor(jsonPath) {
        console.log(`Creating YogaDataExtractor for ${jsonPath}`);
        this.data = null;
        this.keypointsData = null;
        this.segmentsData = null;
        this.jsonPath = jsonPath;
        this.loadPromise = this.loadData();
    }
    /**
     * loadData
     * Asynchronously fetches and parses the JSON file.
     * Populates this.data, this.keypointsData, and this.segmentsData,
     * or falls back to empty arrays on error.
     */
    async loadData() {
        try {
            console.log(`Fetching JSON from ${this.jsonPath}`);
            const response = await fetch(this.jsonPath);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${this.jsonPath}: ${response.status}`);
            }
            const data = await response.json();
            console.log("Loaded JSON data:", data);
            this.data = data;
            this.keypointsData = data.frames || [];
            this.segmentsData = data.segments || [];
            console.log('Segments data:', this.segmentsData);
            console.log('Keypoints data length:', this.keypointsData.length);
        } catch (error) {
            console.error('Error loading JSON:', error);
            this.data = { frames: [], segments: [] };
            this.keypointsData = [];
            this.segmentsData = [];
        }
    }
    /**
     * ensureLoaded
     * Waits for the initial loadData() promise to complete,
     * then verifies that data is available, or resets to empty structures.
     */
    async ensureLoaded() {
        console.log('Ensuring JSON data is loaded');
        await this.loadPromise;
        if (!this.data || !this.segmentsData) {
            console.warn('Data not properly loaded after fetch');
            this.data = { frames: [], segments: [] };
            this.segmentsData = [];
            this.keypointsData = [];
        }
    }
    /**
     * segments
     * Converts raw segment definitions into enriched segment objects.
     * Each segment includes:
     *   - start: frame index where the segment begins
     *   - end: frame index where the segment ends
     *   - phase: descriptive name of the pose/phase
     *   - thresholds: numeric thresholds for pose comparison
     *   - facing: expected user orientation at the segment midpoint
     *   - type: segment category derived from phase string (e.g., "starting", "holding")
     *
     * @returns {Array<Object>} Array of segment metadata objects
     */
    segments() {
        console.log('Generating segments');
        if (!this.data || !this.segmentsData || !Array.isArray(this.segmentsData)) {
            console.warn('Segments data not available:', this.segmentsData);
            return [];
        }

        const segments = this.segmentsData.map(s => {
            try {
                // Extract the ideal keypoints for the segment frames
                const idealKeypoints = this.getIdealKeypoints(s[0], s[1]);
                const middleIdx = Math.floor(idealKeypoints.length / 2);
                // Determine the midpoint keypoint frame for facing detection
                    
                const keypointsFrame = idealKeypoints[middleIdx] || [];
                const segment = {
                    start: s[0],
                    end: s[1],
                    phase: s[2],
                    thresholds: s[3],
                    facing: detectFacing(keypointsFrame),
                    type: s[2].split('_')[0]
                };
                console.log(`Created segment: ${segment.phase}`);
                return segment;
            } catch (e) {
                console.error(`Invalid segment: ${s}`, e);
                return null;
            }
        }).filter(s => s !== null);
        console.log('Segments generated:', segments);
        return segments;
    }
    /**
     * getIdealKeypoints
     * Returns an array of numeric keypoint arrays between two frame indices.
     * Each frame in keypointsData is a list of comma-separated "x,y,z,..." strings.
     *
     * @param {number} startFrame - Index of the first frame (inclusive)
     * @param {number} endFrame - Index of the last frame (exclusive)
     * @returns {Array<Array<number>>} List of [x, y, z] coordinate arrays
     */

    getIdealKeypoints(startFrame, endFrame) {
        if (!this.keypointsData || !Array.isArray(this.keypointsData)) {
            console.warn('No keypoints data available');
            return [];
        }
        const subData = this.keypointsData.slice(startFrame, endFrame);
        return subData.map(frame => 
            frame.map(kp => {
                const [x, y, z] = kp.split(',').slice(0, 3).map(parseFloat);
                return [x || 0, y || 0, z || 0];
            })
        );
    }
}


export function checkPoseSuccess(idealKeypoints, normalizedKeypoints, thresholds) {
  if (!normalizedKeypoints) return false;

  // the 10 keypoint indices we care about:
  const indices = [
    16, // right wrist
    15, // left wrist
    11, // left shoulder
    12, // right shoulder
    13, // left elbow
    14, // right elbow
    25, // left knee
    26, // right knee
    27, // left ankle
    28  // right ankle
  ];

  let underThresholdCount = 0;

  for (const idx of indices) {
    const { dtwDistance } = calculateDtwScore(
      [idealKeypoints[idx]],
      [normalizedKeypoints[idx]]
    );
    if (dtwDistance < thresholds[idx]) {
      underThresholdCount++;
    }
  }
  console.log("No of success points:", underThresholdCount);
  // success if at least 8 of the 10 keypoints are "close enough"
  return underThresholdCount >= 8;
}


/**
 * Calculate the Euclidean distance between two 2D points.
 *
 * @param {number[]} p1  An array [x1, y1].
 * @param {number[]} p2  An array [x2, y2].
 * @returns {number}     The distance = √((x2–x1)² + (y2–y1)²).
 */
function calculateEuclideanDistance1(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.hypot(dx, dy);
}
export function calculateEuclideanDistance(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    
    return Math.sqrt(
        a.reduce((sum, point, i) => {
            return sum + Math.pow(point[0] - b[i][0], 2) + 
                   Math.pow(point[1] - b[i][1], 2);
        }, 0)
    );
}
export function checkBendback(ctx, idealKeypoints, normalizedKeypoints, hipPoint, thresholds) {
    if (!normalizedKeypoints) {
        printTextOnFrame(ctx, 'Keypoints not detected', { x: 50, y: 50 }, 'red');
        return [ctx, false];
    }

    const { dtwDistance: dtwRightWrist } = calculateDtwScore([idealKeypoints[16]], [normalizedKeypoints[16]]);
    const { dtwDistance: dtwLeftWrist } = calculateDtwScore([idealKeypoints[15]], [normalizedKeypoints[15]]);
    const { dtwDistance: dtwLeftShoulder } = calculateDtwScore([idealKeypoints[11]], [normalizedKeypoints[11]]);
    const { dtwDistance: dtwRightShoulder } = calculateDtwScore([idealKeypoints[12]], [normalizedKeypoints[12]]);
    const { dtwDistance: dtwLeftElbow } = calculateDtwScore([idealKeypoints[13]], [normalizedKeypoints[13]]);
    const { dtwDistance: dtwRightElbow } = calculateDtwScore([idealKeypoints[14]], [normalizedKeypoints[14]]);
    const { dtwDistance: dtwLeftKnees } = calculateDtwScore([idealKeypoints[25]], [normalizedKeypoints[25]]);
    const { dtwDistance: dtwRightKnees } = calculateDtwScore([idealKeypoints[26]], [normalizedKeypoints[26]]);
    const { dtwDistance: dtwLeftAnkle } = calculateDtwScore([idealKeypoints[25]], [normalizedKeypoints[25]]);
    const { dtwDistance: dtwRightAnkle } = calculateDtwScore([idealKeypoints[26]], [normalizedKeypoints[26]]);

    const LeftWristTh    = thresholds[15] * calculateEuclideanDistance1(idealKeypoints[15], idealKeypoints[23]);
    const RightWristTh   = thresholds[16] * calculateEuclideanDistance1(idealKeypoints[16], idealKeypoints[23]);
    const LeftShoulderTh = thresholds[11] * calculateEuclideanDistance1(idealKeypoints[11], idealKeypoints[23]);
    const RightShoulderTh= thresholds[12] * calculateEuclideanDistance1(idealKeypoints[12], idealKeypoints[23]);
    const LeftElbowTh    = thresholds[13] * calculateEuclideanDistance1(idealKeypoints[13], idealKeypoints[23]);
    const RightElbowTh   = thresholds[14] * calculateEuclideanDistance1(idealKeypoints[14], idealKeypoints[23]);
    const LeftKneeTh     = thresholds[25] * calculateEuclideanDistance1(idealKeypoints[25], idealKeypoints[23]);
    const RightKneeTh    = thresholds[26] * calculateEuclideanDistance1(idealKeypoints[26], idealKeypoints[23]);
    const LeftAnkleTh    = thresholds[27] * calculateEuclideanDistance1(idealKeypoints[27], idealKeypoints[23]);
    const RightAnkleTh   = thresholds[28] * calculateEuclideanDistance1(idealKeypoints[28], idealKeypoints[23]);
    const modified = {
        11: LeftShoulderTh,
        12: RightShoulderTh,
        13: LeftElbowTh,
        14: RightElbowTh,
        15: LeftWristTh,
        16: RightWristTh,
        25: LeftKneeTh,
        26: RightKneeTh,
        27: LeftAnkleTh,
        28: RightAnkleTh
    };

    // build the new thresholds array in order 0…(thresholds.length-1):
    const thresholds_new = thresholds.map((oldTh, i) =>
      // if we have a modified value for index i, use it; otherwise keep oldTh
      modified.hasOwnProperty(i)
          ? modified[i]
          : oldTh
      );

      const scores = {
          'Hand': { value: dtwLeftWrist, threshold: LeftWristTh },
          'Shoulder': { value: dtwLeftShoulder, threshold: LeftShoulderTh }
      };
      drawDtwScores(ctx, scores);

      const trackedIndices = [
          11, // L shoulder
          12, // R shoulder
          13, // L elbow
          14, // R elbow
          15, // L wrist
          16, // R wrist
          25, // L knee
          26, // R knee
          27, // L ankle
          28  // R ankle
      ];

      // precompute hip as your “origin” in normalized space & pixel space:
      const hipNorm = hipPoint; // [hx, hy] normalized
      const width   = ctx.canvas.width;
      const height  = ctx.canvas.height;
      const hipPix  = [ hipNorm[0]*width, hipNorm[1]*height ];

      // loop over each index
      trackedIndices.forEach(idx => {
      // 1) get relative normalized coords
      const userRel  = normalizedKeypoints[idx]; // [dx, dy]
      const idealRel = idealKeypoints[idx];      // [dx, dy]
      console.log("Here are the userRel: ", userRel);
      console.log("Here are the idealRel: ", idealRel);
      

      // 2) reconstruct absolute normalized coords
      console.log("Here are the hipNorm: ", hipNorm);
      const userNorm  = [ userRel[0]  + hipNorm[0],  userRel[1]  + hipNorm[1] ];
      const idealNorm = [ idealRel[0] + hipNorm[0],  idealRel[1] + hipNorm[1] ];
      console.log("Here are the userNorm: ", userNorm);
      console.log("Here are the idealNorm: ", idealNorm);  
      // 3) convert to pixel space
      const userPix  = [ userNorm[0]  * width, userNorm[1]  * height ];
      const idealPix = [ idealNorm[0] * width, idealNorm[1] * height ];

      // 4) log them
      console.log(
          `Index ${idx} — User pixel: (${userPix[0].toFixed(1)}, ${userPix[1].toFixed(1)})`,
          `Ideal pixel: (${idealPix[0].toFixed(1)}, ${idealPix[1].toFixed(1)})`
      );

      // (optional) draw guidance circle + arrow for each joint:
      const DistPix = calculateEuclideanDistance1(hipPix, idealPix);
      const radius  = thresholds[idx] * DistPix;  
      ctx.beginPath();
      ctx.arc(idealPix[0], idealPix[1], radius, 0, Math.PI*2);
      ctx.strokeStyle = "#FF0000";
      ctx.lineWidth   = 2;
      ctx.stroke();
      // arrow
      ctx.beginPath();
      ctx.moveTo(userPix[0], userPix[1]);
      ctx.lineTo(idealPix[0], idealPix[1]);
      ctx.strokeStyle = "yellow";
      ctx.lineWidth   = 3;
      ctx.stroke();
      // arrowhead
      const angle     = Math.atan2(idealPix[1]-userPix[1], idealPix[0]-userPix[0]);
      const arrowSize = 10;
      ctx.beginPath();
      ctx.moveTo(idealPix[0], idealPix[1]);
      ctx.lineTo(
          idealPix[0] - arrowSize*Math.cos(angle + Math.PI/6),
          idealPix[1] - arrowSize*Math.sin(angle + Math.PI/6)
      );
      ctx.moveTo(idealPix[0], idealPix[1]);
      ctx.lineTo(
          idealPix[0] - arrowSize*Math.cos(angle - Math.PI/6),
          idealPix[1] - arrowSize*Math.sin(angle - Math.PI/6)
      );
      ctx.stroke();
    });

    const success = checkPoseSuccess(idealKeypoints, normalizedKeypoints, thresholds_new);
    return [ctx, success];
}


/**
 * BasePhase
 * Abstract class that all specific phase handlers extend.
 * Provides common properties: reference to the controller, default hold duration,
 * and placeholders for normalized keypoints and hip tracking.
 */
export class BasePhase {
    constructor(controller) {
        this.controller = controller;
        this.holdDuration = 2;
        this.normalizedKeypoints = null;
        this.hipPoint = 0;
    }
    /**
     * process
     * Each subclass must implement this method to handle its phase logic.
     * @param {number} currentTime - The timestamp (ms) for the current frame
     * @throws {Error} if not overridden
     */
    process(currentTime) {
        throw new Error('Not implemented');
    }
}


/**
 * StartPhase
 * Handles the initial "starting" segment where the user must assume the start pose
 * with the correct facing direction and hold it for the required duration.
 */
export class StartPhase extends BasePhase {
    /**
     * @param {Controller} controller - The main Controller instance
     * @param {string} targetFacing - The required orientation (e.g., 'front', 'side')
     */
    constructor(controller, targetFacing) {
        super(controller);
        console.log(`StartPhase initialized with target facing: ${targetFacing}`);
        this.targetFacing = targetFacing;
        this.start_time = null;
    }
    
    /**
     * process
     * Checks user’s facing direction, compares current keypoints to the expert start pose,
     * and enforces a hold duration. Draws feedback on the canvas.
     *
     * @param {number} currentTime - The timestamp (ms) for the current frame
     * @returns {[string, boolean]} 
     *   • phase name (string)
     *   • completed flag (true once holdDuration is reached in correct pose)
     */
    process(currentTime) {
        console.log('Processing StartPhase');
        // 1) Detect current facing, defaulting to 'random' if no landmarks
        const detectedFacing = this.controller.landmarks ? detectFacing(this.controller.landmarks) : 'random';
        console.log(`StartPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`);
        // 2) Identify the phase name from the current segment metadata
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        // 3) Load expert keypoints for comparison (though expertKeypoints is unused here)
        const expertKeypoints = this.controller.getIdealKeypoints(this.targetFacing);
        // 4) Load the ideal starting keypoints for DTW comparison
        const idealStartingKeypoints = this.controller.getNextIdealKeypoints('starting', 0);
        // 5) Grab the thresholds configured for the starting segment
        this.thresholds = this.controller.segments[0].thresholds;
        console.log(`Thresholds of starting phase are ${this.thresholds}`);
        // 6) Use checkBendback to validate posture; returns updated context and a success flag
        const [ctx, success] = checkBendback(
            this.controller.frame,
            idealStartingKeypoints,
            this.controller.normalizedKeypoints,
            this.hipPoint,
            this.thresholds
        );
        // Update the controller’s canvas context with any drawings from checkBendback
        this.controller.frame = ctx;
        console.log(`starting Frame Success: ${success}`);
        // 7) Calculate Euclidean distance between user and expert keypoints (not directly used)
        const distance = calculateEuclideanDistance(
            this.controller.normalizedKeypoints,
            expertKeypoints
        ); 
        // 8) If posture is correct AND facing matches target, show positive feedback and handle hold timing
        if ( success && (detectedFacing === this.targetFacing)) {
        // if ((detectedFacing === this.targetFacing)) {
            printTextOnFrame(this.controller.frame, `Starting pose (${this.targetFacing}) detected`, { x: 10, y: 60 }, 'green');
            // Record the time when correct pose was first seen
            if(this.start_time == null){
                this.start_time = currentTime;
            }
            else{
                // If pose has been held long enough, mark phase as completed
                
                if ( currentTime - this.start_time >= this.holdDuration) {
                    console.log('Start phase completed');
                    return [phase, true];
                }
            }
            
        } else {
            // 9) Otherwise, prompt user to face the correct direction
            
            printTextOnFrame(this.controller.frame, `Face ${this.targetFacing} to start`, { x: 10, y: 60 }, 'red');
        }
        // 10) If hold duration not yet met, indicate phase is still in progress
        
        return [phase, false];
    }
}



// In phase_handlers.js - Modified TransitionPhase
/**
 * TransitionPhase
 * Handles the “transition” segment of an exercise, giving the user a countdown
 * and checking their movement against the next phase’s ideal pose.
 */
export class TransitionPhase extends BasePhase {
    /**
     * @param {Controller} controller - The main Controller instance
     * @param {string} startFacing - The initial facing direction (unused here, but available)
     */
    constructor(controller , startFacing) {
        super(controller);
        // Maximum allowed time (seconds) to complete this transition
        this.transitionTimeout = 15; 
        // Expected facing direction when starting the transition (not enforced here)
        this.startFacing = startFacing;
        // this.thresholds = thresholds;
        // this.thresholds = (thresholds ? [...thresholds] : [9.5, 4, 3]).map(t => t * 1.5);
        this.thresholds = null;
        console.log(`Transition thresholds: ${this.thresholds}`);
    }
    /**
     * process
     * Called each frame during a transition. Draws a countdown timer,
     * retrieves the next phase’s ideal keypoints, and runs a posture check.
     *
     * @param {number} currentTime - Current timestamp (ms)
     * @returns {[string, boolean]}
     *   • current phase name
     *   • success flag indicating whether transition posture is met
     */
    process(currentTime) {
        const elapsedMs = currentTime - this.controller.startTime;
        const elapsedSec = elapsedMs / 1000;
        // Time remaining in ms before timeout
        const timeLeft = this.transitionTimeout - elapsedMs;
        // Overlay the countdown timer on the video frame
        printTextOnFrame(
            this.controller.frame,
            `Transition: ${(timeLeft).toFixed(1)}s remaining`,
            { x: 10, y: 60 },
            'yellow'
        );
        // Get NEXT phase's ideal keypoints (if valid index)
        const nextSegmentIdx = this.controller.currentSegmentIdx + 1;
        console.log(`next segment index is: ${nextSegmentIdx}`);
        const phase = this.controller.segments[nextSegmentIdx].phase; 
        // Pull thresholds from the next segment’s configuration
        this.thresholds = this.controller.segments[nextSegmentIdx].thresholds;
        console.log(`Transition thresholds: ${this.thresholds}`);
        console.log(`next phase is: ${nextSegmentIdx}`);
        // Fetch the ideal keypoints for the next phase’s midpoint
        const idealKeypoints = this.controller.getNextIdealKeypoints(phase, nextSegmentIdx);
        
        console.log(`Here are the Keypoints ${idealKeypoints}`);
        
        console.log(`Here are the Keypoints size ${idealKeypoints.length}`);
        console.log(`Normalised Keypoints Transition ${this.controller.normalizedKeypoints}`);
        // Run a bend-back/posture check against the next phase’s ideal pose
        // The checkBendback function returns an updated canvas context and success boolean
        const [ctx, success] = checkBendback(
            this.controller.frame,
            idealKeypoints,
            this.controller.normalizedKeypoints,
            this.controller.hipPoint,
            this.thresholds
        );
        // Update the controller’s frame context with any helper drawings
        this.controller.frame = ctx;
        console.log(`Success: ${success}`);
        // If the transition time has fully elapsed, reset to the relaxation segment
        if((elapsedMs >= this.transitionTimeout)){
            this.controller.currentSegmentIdx = 0;
        }
        // Return the current segment’s phase name and whether the user met the posture
        return [
            this.controller.segments[this.controller.currentSegmentIdx].phase,
            success];
    }
}

/**
 * HoldingPhase
 * Manages the “holding” segment where the user must maintain a specific pose.
 * Provides feedback via DTW scores and guidance arrows, and enforces hold duration.
 */

export class HoldingPhase extends BasePhase {
    /**
     * @param {Controller} controller - Main Controller instance
     * @param {number[]} thresholds - Array of threshold values for DTW and posture checks
     * @param {string} startFacing - Expected facing direction (unused here)
     */
    constructor(controller, thresholds, startFacing) {
        // Reset all timers and state for a fresh hold
        super(controller);
        this._resetTimers();
        this.startFacing = startFacing;
        console.log('HoldingPhase initialized with thresholds:', thresholds);
        this.thresholds = thresholds;
        console.log(`Thresholds are: ${thresholds}`)
        // Track when the user first achieved a successful hold
        this.holdStartTime = null;
        this.successDuration = 0;
        this.minHoldDuration = 0;
        this.completedHold = false;
        this.exitThresholdMultiplier = 1.1;
        this.leavePoseTime = null;     
    }
    /**
     * Reset timers and state between holds.
     * Called when a hold completes to allow re-entry logic.
     */
    _resetTimers() {
        this.holdStartTime   = null;
        this.successDuration = 0;
        this.completedHold   = false;
        this.leavePoseTime   = null;
    }
    
    /**
     * process
     * Called each frame during a holding segment. Checks posture, computes DTW
     * distance, draws guidance, and determines when the hold is completed or abandoned.
     *
     * @param {number} currentTime - Current timestamp (ms)
     * @returns {[string, boolean]}
     *   • current phase name
     *   • completed flag indicating whether the hold phase is done
     */
    
    process(currentTime) {
        console.log("controller"+this.controller.normalizedKeypoints) ;
        console.log('Processing HoldingPhase');
        // 1) Determine phase name and ideal keypoints
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        const idealKeypoints = this.controller.getIdealKeypoints(phase);
        console.log('Ideal keypoints for holding phase from phase handler:', idealKeypoints);
        console.log(`Normalised keypoints in Holding ${this.controller.normalizedKeypoints}`);

        // 2) If there was a previous transition, compute and display DTW on it
        if (this.controller.lastHoldingIdx !== -1 && 
            this.controller.currentSegmentIdx > this.controller.lastHoldingIdx && 
            this.controller.transitionKeypoints.length) {
            // Gather ideal vs. actual transition keypoints
            const idealTransKeypoints = this.controller.getTransitionKeypoints(this.controller.lastHoldingIdx, this.controller.currentSegmentIdx);
            if (idealTransKeypoints.length && this.controller.transitionKeypoints.length) {
                // Compare up to the shorter length
                const minLen = Math.min(this.controller.transitionKeypoints.length, idealTransKeypoints.length);
                const userTrans = this.controller.transitionKeypoints.slice(0, minLen).flat();
                const idealTrans = idealTransKeypoints.slice(0, minLen).flat();
                const { dtwDistance } = calculateDtwScore(userTrans, idealTrans);
                const color = dtwDistance < 50 ? 'green' : 'red';
                // Overlay the transition DTW score
                printTextOnFrame(this.controller.frame, `Transition DTW: ${dtwDistance.toFixed(2)}`, { x: 10, y: 120 }, color);
            }
        }

        // 3) If normalized keypoints are available, run posture check
        if (this.controller.normalizedKeypoints) {
            // checkBendback returns updated context and success boolean
            const [ctx, success] = checkBendback(this.controller.frame, idealKeypoints, this.controller.normalizedKeypoints, this.controller.hipPoint, this.thresholds);
            console.log(`Success in holding frame ${success}`);
            this.controller.frame = ctx;
            // Compute overall DTW on the whole pose for guidance
            const { dtwDistance: dtwHands } = calculateDtwScore(idealKeypoints[15], this.controller.normalizedKeypoints[15]);
            const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints[15], this.controller.normalizedKeypoints[15]);
            
            const exitThreshold = this.thresholds[15];
            // 4) Handle early abandonment: if user breaks pose before completion
            if (!success && !this.completedHold) {
            // user is out of pose before completing
            if (this.leavePoseTime === null) {
                this.leavePoseTime = currentTime;
            }
            const elapsedLeave = currentTime - this.leavePoseTime;
            if (elapsedLeave > this.controller.phaseTimeouts.holdingAbandonment) {
                // 10 s up → force relaxation
                this.controller.enterRelaxation();
                return [ 'holding', false ];
            }
            } else {
                // either success or already completedHold
                this.leavePoseTime = null;
            }
            // Draw DTW scores
            const scores = {
                [phase]: { value: dtwWhole, threshold: this.thresholds[0] }
            };
            drawDtwScores(this.controller.frame, scores);

            // Draw arrow from user wrist to ideal wrist position
            const width = this.controller.frame.canvas.width;
            const height = this.controller.frame.canvas.height;
            const userWrist = this.controller.landmarks[15]; 
            const idealWrist = idealKeypoints[15];
            const userWristPixel = [(userWrist[0] + 1) * width / 2, (userWrist[1] + 1) * height / 2];
            const idealWristPixel = [(idealWrist[0] + 1) * width / 2, (idealWrist[1] + 1) * height / 2];
            this.controller.frame.beginPath();
            this.controller.frame.moveTo(userWristPixel[0], userWristPixel[1]);
            this.controller.frame.lineTo(idealWristPixel[0], idealWristPixel[1]);
            this.controller.frame.strokeStyle = success ? 'green' : 'red';
            this.controller.frame.lineWidth = 3;
            this.controller.frame.stroke();
            // Draw arrowhead
            const angle = Math.atan2(idealWristPixel[1] - userWristPixel[1], idealWristPixel[0] - userWristPixel[0]);
            const arrowSize = 10;
            this.controller.frame.beginPath();
            this.controller.frame.moveTo(idealWristPixel[0], idealWristPixel[1]);
            this.controller.frame.lineTo(
                idealWristPixel[0] - arrowSize * Math.cos(angle + Math.PI / 6),
                idealWristPixel[1] - arrowSize * Math.sin(angle + Math.PI / 6)
            );
            this.controller.frame.moveTo(idealWristPixel[0], idealWristPixel[1]);
            this.controller.frame.lineTo(
                idealWristPixel[0] - arrowSize * Math.cos(angle - Math.PI / 6),
                idealWristPixel[1] - arrowSize * Math.sin(angle - Math.PI / 6)
            );
            this.controller.frame.stroke();
            console.log(`Arrow drawn from (${userWristPixel[0]}, ${userWristPixel[1]}) to (${idealWristPixel[0]}, ${idealWristPixel[1]})`);

            if (success) {
                if (!this.holdStartTime) this.holdStartTime = currentTime;
                this.successDuration = currentTime - this.holdStartTime;
                printTextOnFrame(this.controller.frame, `Holding ${phase} (${this.successDuration.toFixed(1)}s)`, { x: 10, y: 60 }, 'green');
                if (this.successDuration >= this.minHoldDuration && !this.completedHold) {
                    this.completedHold = true;
                    printTextOnFrame(this.controller.frame, 'Hold completed, stay or adjust to exit', { x: 10, y: 90 }, 'green');
                }
            } else {
                if (this.completedHold && dtwHands > exitThreshold) {
                    const phaseName = phase.split('_')[1] || phase;
                    printTextOnFrame(this.controller.frame, `${phaseName} completed, exiting hold (DTW: ${dtwHands.toFixed(2)})`, { x: 10, y: 60 }, 'green');
                    console.log('Holding phase completed');
                    
                    this._resetTimers();
                    return [phase, true];
                }
                if (!this.completedHold) {
                    this.holdStartTime = null;
                    this.successDuration = 0;
                    printTextOnFrame(this.controller.frame, 'Adjust pose to hold', { x: 10, y: 60 }, 'red');
                } else {
                    printTextOnFrame(this.controller.frame, `Hold completed, stay or adjust to exit (DTW: ${dtwHands.toFixed(2)})`, { x: 10, y: 60 }, 'green');
                }
            }
        } else {
            printTextOnFrame(this.controller.frame, 'Adjust pose', { x: 10, y: 60 }, 'red');
            this.holdStartTime = null;
            this.successDuration = 0;
            this.completedHold = false;
        }
        return[ this.controller.segments[this.controller.currentSegmentIdx].phase, false ];
    }
}
/**
 * EndingPhase
 * Manages the “ending” segment where the user must return to the end pose
 * and hold it, similar to StartPhase but signifying rep completion.
 */
export class EndingPhase extends BasePhase {
    /**
     * @param {Controller} controller - Main Controller instance
     * @param {string} targetFacing - Required orientation to finish the rep
     */
    constructor(controller, targetFacing) {
        super(controller);
        console.log(`EndingPhase initialized with target facing: ${targetFacing}`);
        this.targetFacing = targetFacing;
        this.thresholds = null;
    }
    /**
     * process
     * Checks that the user has assumed the end pose with correct facing,
     * holds it for the required duration, and signals phase completion.
     *
     * @param {number} currentTime - Current timestamp (ms)
     * @returns {[string, boolean]}
     *   • phase name
     *   • completed flag indicating whether end hold duration is met
     */
    process(currentTime) {
        console.log('Processing EndingPhase');
        // 1) Detect current facing or default to 'random'
        const detectedFacing = this.controller.landmarks ? detectFacing(this.controller.landmarks) : 'random';
        console.log(`EndingPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`);
        // 2) Identify phase name and load ideal keypoints & thresholds
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        const idealEndingKeypoints = this.controller.getNextIdealKeypoints('starting', 0);
        this.thresholds = this.controller.segments[0].thresholds;
        console.log(`Thresholds of ending phase are ${this.thresholds}`);
        // 3) Run bend-back/posture check on the end pose
        const [ctx, success] = checkBendback(
            this.controller.frame,
            idealEndingKeypoints,
            this.controller.normalizedKeypoints,
            this.controller.hipPoint,
            this.thresholds
        );
        this.controller.frame = ctx;
        console.log(`Ending Frame Success: ${success}`);
        // 4) If posture and facing are correct, prompt and hold
        if (success && (detectedFacing === this.targetFacing)) {
        // if ((detectedFacing === this.targetFacing)) {
            printTextOnFrame(this.controller.frame, 'Repetition completed', { x: 10, y: 60 }, 'green');
            if (currentTime - this.controller.startTime >= this.holdDuration) {
                console.log('Ending phase completed');
                return [phase, true];
            }
        } else {
            printTextOnFrame(this.controller.frame, `Face ${this.targetFacing} to end or Go to ending position to end`, { x: 10, y: 60 }, 'red');
        }
        return [phase, false];
    }
}


/**
 * RelaxationPhase
 * Handles the rest period between reps or exercises, displaying a calming prompt
 * and detecting when the user is ready to resume.
 */
export class RelaxationPhase extends BasePhase {
    /**
     * @param {Controller} controller - Main Controller instance
     */
    constructor(controller) {
        super(controller);
        this.currentFeedback   = "Relax and breathe";
    }
    /**
     * process
     * Clears any transition data, draws the relaxation prompt,
     * and returns completion status based on pose + facing check.
     *
     * @param {number} currentTime - Current timestamp (ms) — unused here
     * @returns {{ phase: string, completed: boolean }}
     *   • phase: 'relaxation'
     *   • completed: whether the user is ready to resume
     */
    process(currentTime) {
        // clear any transition data
        // 1) Clear stored transition traces and last holding index
        this.controller.transitionKeypoints = [];
        this.controller.lastHoldingIdx     = -1;

        // draw feedback
        printTextOnFrame(
        this.controller.frame,
        this.currentFeedback,
        { x: 10, y: 60 },
        'rgb(255, 165, 0)'
        );

        // only the shouldExitRelaxation() result matters here
        return {
        phase:     'relaxation',
        completed: this.shouldExitRelaxation()
    };
  }
/**
 * shouldExitRelaxation
 * Determines if the user is back in the starting pose and facing correctly,
 * indicating readiness to begin the next rep.
 *
 * @returns {boolean} True if distance and facing thresholds are met
 */
shouldExitRelaxation() {
    const startSegment = this.controller.segments.find(s => s.type === 'starting');
    if (!startSegment) return false;

    // get expert pose (you may need to pick the right frame index)
    const expertKeypoints = this.controller.getIdealKeypoints(startSegment.phase);
    const userKeypoints   = this.controller.normalizedKeypoints;
    const distance        = calculateEuclideanDistance(userKeypoints, expertKeypoints);

    // check facing + distance threshold
    const THRESHOLD       = 0.15;
    const userFacing      = this.controller.landmarks
                          ? detectFacing(this.controller.landmarks)
                          : null;

    return distance < THRESHOLD && userFacing === startSegment.facing;
  }
}
export class TransitionAnalyzer {
    constructor(jsonPath, yogaName) {
        console.log(`Creating TransitionAnalyzer for ${yogaName} with JSON: ${jsonPath}`);
        this.yoga = new YogaDataExtractor(jsonPath);
        this.yogaName = yogaName;
        this.segments = this.yoga.segments();
        this.transitionPaths = this._createTransitionPaths();
        console.log('Transition paths created:', this.transitionPaths);
    }

    _createTransitionPaths() {
        console.log('Creating transition paths');
        const transitionPaths = [];
        const holdingIndices = this.segments
            .map((seg, i) => seg.type === 'starting' || seg.type === 'holding' || seg.type === 'ending' ? i : -1)
            .filter(i => i !== -1);

        for (let i = 0; i < holdingIndices.length - 1; i++) {
            const startIdx = holdingIndices[i];
            const endIdx = holdingIndices[i + 1];
            const startFrame = this.segments[startIdx].end;
            const endFrame = this.segments[endIdx].start;
            if (startFrame >= endFrame) continue;

            const idealKeypoints = this.yoga.getIdealKeypoints(startFrame, endFrame);
            if (!idealKeypoints.length) continue;

            const leftWristKeypoints = idealKeypoints.map(frame => frame[15]);
            const threshold = this.segments[endIdx].thresholds ? this.segments[endIdx].thresholds[0] : 0.1;
            transitionPaths.push({
                startSegmentIdx: startIdx,
                endSegmentIdx: endIdx,
                startFrame,
                endFrame,
                leftWristPath: leftWristKeypoints,
                threshold
            });
        }
        console.log('Transition paths:', transitionPaths);
        return transitionPaths;
    }

    analyzeTransition(ctx, userKeypoints, currentSegmentIdx) {
        console.log('Analyzing transition for segment:', currentSegmentIdx);
        const userLeftWrist = userKeypoints[15];
        for (const path of this.transitionPaths) {
            if (currentSegmentIdx > path.startSegmentIdx && currentSegmentIdx < path.endSegmentIdx) {
                drawTransitionPath(ctx, path.leftWristPath, userKeypoints, path.threshold);
                const distances = path.leftWristPath.map(p => Math.hypot(userLeftWrist[0] - p[0], userLeftWrist[1] - p[1]));
                const minDistance = Math.min(...distances);
                const withinPath = minDistance <= path.threshold;
                const color = withinPath ? 'green' : 'red';
                printTextOnFrame(ctx, `Transition: ${withinPath ? 'Within Path' : 'Off Path'} (Dist: ${minDistance.toFixed(2)})`, { x: 10, y: 90 }, color);
                return [ctx, withinPath];
            }
        }
        return [ctx, false];
    }

    // transition_analysis.js
    _toPixelCoords(point, width, height) {
        // Handle array or object format
        const x = point.x ?? point[0] ?? 0;
        const y = point.y ?? point[1] ?? 0;

        const safeWidth = width || 1280;
        const safeHeight = height || 720;

        return [
            (x + 1) * safeWidth / 2,
            (y + 1) * safeHeight / 2
        ];
    }
    getTransitionEndTarget(currentSegmentIdx) {
        for (const path of this.transitionPaths) {
            if (currentSegmentIdx > path.startSegmentIdx && currentSegmentIdx <= path.endSegmentIdx) {
                return path.leftWristPath[path.leftWristPath.length - 1];
            }
        }
        return [0, 0, 0];
    }
}

export function integrateWithController(controller, transitionAnalyzer) {
    console.log('Integrating TransitionAnalyzer with Controller');
    const originalProcessExercise = controller.processExercise;
    controller.processExercise = function(currentTime) {
        const [phase, exerciseName, count, targetReps] = originalProcessExercise.call(this, currentTime);
        const currentSegment = this.segments[this.currentSegmentIdx];

        if (this.normalizedKeypoints) {
            const width = this.frame.canvas.width;
            const height = this.frame.canvas.height;
            const userLeftWrist = this.normalizedKeypoints[15];
            console.info(`User wrist position is: ${userLeftWrist}`);
            const userWristPixel = transitionAnalyzer._toPixelCoords(userLeftWrist, width, height);

            for (const path of transitionAnalyzer.transitionPaths) {
                if (this.currentSegmentIdx > path.startSegmentIdx && this.currentSegmentIdx <= path.endSegmentIdx) {
                    drawTransitionPath(this.frame, path.leftWristPath, this.normalizedKeypoints, path.threshold);

                    if (currentSegment.type !== 'starting' && currentSegment.type !== 'holding' && currentSegment.type !== 'ending') {
                        const [ctx, withinPath] = transitionAnalyzer.analyzeTransition(this.frame, this.normalizedKeypoints, this.currentSegmentIdx);
                        this.frame = ctx;
                        if (withinPath) {
                            const targetWrist = transitionAnalyzer.getTransitionEndTarget(this.currentSegmentIdx);
                            
                            console.info("working till here")
                            const targetPixel = transitionAnalyzer._toPixelCoords(targetWrist, width, height);
                            this.frame.beginPath();
                            this.frame.moveTo(userWristPixel[0], userWristPixel[1]);
                            this.frame.lineTo(targetPixel[0], targetPixel[1]);
                            this.frame.strokeStyle = 'green';
                            this.frame.lineWidth = 3;
                            this.frame.stroke();
                        }
                    } else if (['starting', 'holding', 'ending'].includes(currentSegment.type) && path.endSegmentIdx === this.currentSegmentIdx) {
                        const handler = this.phaseHandlers[currentSegment.handlerKey];
                        const [, completed] = handler.process(currentTime);
                        if (!completed) {
                            drawTransitionPath(this.frame, path.leftWristPath, this.normalizedKeypoints, path.threshold);
                            const idealKeypoints = this.getIdealKeypoints(currentSegment.phase);
                            if (idealKeypoints.length) {
                                const targetWrist = idealKeypoints[15];
                                console.info("working till here")
                                const targetPixel = transitionAnalyzer._toPixelCoords(targetWrist, width, height);
                                this.frame.beginPath();
                                this.frame.moveTo(userWristPixel[0], userWristPixel[1]);
                                this.frame.lineTo(targetPixel[0], targetPixel[1]);
                                this.frame.strokeStyle = 'green';
                                this.frame.lineWidth = 3;
                                this.frame.stroke();
                            }
                        }
                    }
                }
            }
        }
        return [phase, exerciseName, count, targetReps];
    };
}