// utils/camera_utils.js
console.log('Loading camera_utils.js');

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
// // utils/camera_utils.js
// console.log('Loading camera_utils.js');

// /**
//  * Prints text on the canvas at a specified position.
//  * @param {CanvasRenderingContext2D} ctx - The canvas context.
//  * @param {string} text - The text to display.
//  * @param {Object} position - The {x, y} coordinates.
//  * @param {string} color - The color in CSS format (e.g., 'green').
//  */
// export function printTextOnFrame(ctx, text, position = { x: 10, y: 50 }, color = 'red') {
//     if (!ctx || !ctx.canvas) {
//         console.error('Invalid canvas context for printTextOnFrame');
//         return;
//     }
//     ctx.font = '20px Helvetica';
//     ctx.fillStyle = color;
//     ctx.fillText(text, position.x, position.y);
//     console.log(`Text drawn: "${text}" at (${position.x}, ${position.y}) in ${color}`);
// }

// /**
//  * Draws the pose skeleton on the canvas using MediaPipe landmarks.
//  * @param {CanvasRenderingContext2D} ctx - The canvas context.
//  * @param {Array} landmarks - Array of MediaPipe Pose landmarks.
//  */
// export function drawPoseSkeleton(ctx, landmarks) {
//     if (!ctx || !ctx.canvas) {
//         console.error('Invalid canvas context for drawPoseSkeleton');
//         return;
//     }
//     const width = ctx.canvas.width;
//     const height = ctx.canvas.height;

//     const POSE_CONNECTIONS = [
//         [11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [12, 14], [13, 15], 
//         [14, 16], [23, 25], [24, 26], [25, 27], [26, 28]
//     ];

//     ctx.strokeStyle = 'green';
//     ctx.lineWidth = 2;

//     for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
//         const start = landmarks[startIdx];
//         const end = landmarks[endIdx];
//         if (start.visibility > 0.5 && end.visibility > 0.5) {
//             ctx.beginPath();
//             ctx.moveTo(start.x * width, start.y * height);
//             ctx.lineTo(end.x * width, end.y * height);
//             ctx.stroke();
//         }
//     }

//     ctx.fillStyle = 'blue';
//     landmarks.forEach((landmark) => {
//         if (landmark.visibility > 0.5) {
//             ctx.beginPath();
//             ctx.arc(landmark.x * width, landmark.y * height, 5, 0, 2 * Math.PI);
//             ctx.fill();
//         }
//     });

//     console.log('Pose skeleton drawn with', landmarks.length, 'landmarks');
// }

// /**
//  * Draws DTW scores on the canvas in a boxed area in the bottom-left corner.
//  * @param {CanvasRenderingContext2D} ctx - The canvas context.
//  * @param {Object} scores - Object with keys (e.g., 'Whole Body', 'Hands') and values {value, threshold}.
//  */
// export function drawDtwScores(ctx, scores) {
//     if (!ctx || !ctx.canvas) {
//         console.error('Invalid canvas context for drawDtwScores');
//         return;
//     }
//     const width = ctx.canvas.width;
//     const height = ctx.canvas.height;
//     const xPos = 10;
//     const yPosStart = height - 150; // Match Python's placement

//     console.log('Attempting to draw DTW scores:', scores);

//     // Draw background box
//     ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
//     ctx.fillRect(xPos, yPosStart - 30, 300, 120); // Wider for longer text

//     ctx.font = '14px Helvetica';
//     ctx.fillStyle = 'white';
//     ctx.fillText('DTW Scores:', xPos + 10, yPosStart);

//     if (!scores || Object.keys(scores).length === 0) {
//         ctx.fillStyle = 'red';
//         ctx.fillText('No scores available', xPos + 10, yPosStart + 30);
//         console.warn('No DTW scores provided, drew placeholder');
//         return;
//     }

//     let yPos = yPosStart + 30;
//     for (const [label, data] of Object.entries(scores)) {
//         const score = data.value;
//         const threshold = data.threshold;
//         const color = score < threshold ? 'green' : 'red';
//         const text = `${label}: ${score.toFixed(2)} (th: ${threshold.toFixed(2)})`;
//         ctx.fillStyle = color;
//         ctx.fillText(text, xPos + 10, yPos);
//         console.log(`Drew DTW score: "${text}" at (${xPos + 10}, ${yPos}) in ${color}`);
//         yPos += 20;
//     }
// }

// /**
//  * Draws the ideal transition path and a target circle for the user's wrist.
//  * @param {CanvasRenderingContext2D} ctx - The canvas context.
//  * @param {Array} idealWristPath - Array of [x, y, z] coordinates or a single [x, y, z] point.
//  * @param {Array} userKeypoints - Array of normalized keypoints for the user.
//  * @param {number} threshold - Threshold distance for the target circle.
//  */
// export function drawTransitionPath(ctx, idealWristPath, userKeypoints, threshold) {
//     if (!ctx || !ctx.canvas) {
//         console.error('Invalid canvas context for drawTransitionPath');
//         return;
//     }
//     const width = ctx.canvas.width;
//     const height = ctx.canvas.height;

//     if (!userKeypoints || userKeypoints.length < 16) {
//         console.warn('User keypoints not available or insufficient');
//         return;
//     }

//     const userWrist = userKeypoints[15]; // LEFT_WRIST
//     const userWristPixel = [(userWrist[0] + 1) * width / 2, (userWrist[1] + 1) * height / 2];

//     if (!idealWristPath) {
//         console.warn('Ideal wrist path is empty or undefined');
//         return;
//     }

//     const targetPoint = Array.isArray(idealWristPath[0]) ? idealWristPath[idealWristPath.length - 1] : idealWristPath;
//     const targetPixel = [(targetPoint[0] + 1) * width / 2, (targetPoint[1] + 1) * height / 2];

//     let radius = threshold * width / 120;
//     if (radius < 5) radius = 5;

//     const distance = Math.hypot(userWristPixel[0] - targetPixel[0], userWristPixel[1] - targetPixel[1]);
//     const circleColor = distance <= radius ? 'green' : 'red';

//     ctx.beginPath();
//     ctx.arc(targetPixel[0], targetPixel[1], radius, 0, 2 * Math.PI);
//     ctx.strokeStyle = circleColor;
//     ctx.lineWidth = 2;
//     ctx.stroke();

//     ctx.beginPath();
//     ctx.arc(userWristPixel[0], userWristPixel[1], 5, 0, 2 * Math.PI);
//     ctx.fillStyle = 'red';
//     ctx.fill();

//     console.log('Transition path drawn - Target:', targetPixel, 'User wrist:', userWristPixel);
// }

// /**
//  * Draws a guidance arrow from the user's wrist to the ideal wrist position.
//  * @param {CanvasRenderingContext2D} ctx - The canvas context.
//  * @param {Array} userWrist - Normalized [x, y, z] coordinates of the user's wrist.
//  * @param {Array} idealWrist - Normalized [x, y, z] coordinates of the ideal wrist.
//  * @param {number} width - Canvas width.
//  * @param {number} height - Canvas height.
//  * @param {boolean} isSuccess - Whether the pose is correct (determines arrow color).
//  */
// export function drawGuidanceArrow(ctx, userWrist, idealWrist, width, height, isSuccess) {
//     if (!ctx || !ctx.canvas) {
//         console.error('Invalid canvas context for drawGuidanceArrow');
//         return;
//     }
//     if (!userWrist || !idealWrist || userWrist.length < 3 || idealWrist.length < 3) {
//         console.warn('Invalid wrist coordinates for arrow:', { userWrist, idealWrist });
//         return;
//     }

//     const userWristPixel = [(userWrist[0] + 1) * width / 2, (userWrist[1] + 1) * height / 2];
//     const idealWristPixel = [(idealWrist[0] + 1) * width / 2, (idealWrist[1] + 1) * height / 2];

//     if (isNaN(userWristPixel[0]) || isNaN(userWristPixel[1]) || isNaN(idealWristPixel[0]) || isNaN(idealWristPixel[1])) {
//         console.warn('Invalid pixel coordinates for arrow:', { userWristPixel, idealWristPixel });
//         return;
//     }

//     ctx.beginPath();
//     ctx.moveTo(userWristPixel[0], userWristPixel[1]);
//     ctx.lineTo(idealWristPixel[0], idealWristPixel[1]);
//     ctx.strokeStyle = isSuccess ? 'green' : 'yellow';
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

//     console.log(`Guidance arrow drawn from (${userWristPixel[0]}, ${userWristPixel[1]}) to (${idealWristPixel[0]}, ${idealWristPixel[1]}) - Success: ${isSuccess}`);
// }