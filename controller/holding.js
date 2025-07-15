
import { drawDtwScores, printTextOnFrame } from '../utils/camera_utils.js';

/**
 * Given a hip point and a target joint, compute both the raw and unit direction vectors.
 * @param {[number,number]} hip     – [x,y] (normalized or pixel)
 * @param {[number,number]} joint   – [x,y] (same space as hip)
 * @returns {{ raw: [number,number], unit: [number,number], length: number }}
 */
function getDirectionVector(hip, joint) {
  const dx = joint[0] ;
  const dy = joint[1] ;
  const length = Math.hypot(dx, dy);
  return {
    raw:  [dx, dy],
    unit: length > 0 ? [dx/length, dy/length] : [0,0],
    length
  };
}
export function getScalingFactor(ctx, idx, idealKps, userKps, hipPoint) {
  if(userKps == []) return 1;
  const width  = ctx.canvas.width;
  const height = ctx.canvas.height;

  // 1) Get direction+distance from hip → user joint
  const userDir  = getDirectionVector(hipPoint, userKps[idx]);
  // 2) Get direction+distance from hip → ideal joint
  const idealDir = getDirectionVector(hipPoint, idealKps[idx]);

  // 3) Compute scale so idealDist → userDist
  const scale = userDir.length / (idealDir.length || 1);

  // 4) Scale the ideal vector
  return scale;

}

/**
 * Compute the “corrected” ideal keypoint—re‑scaled so that
 * its distance from the hip matches the user’s. Returns both
 * normalized coords and pixel coords.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} idx                         – keypoint index (e.g. 15 for left wrist)
 * @param {Array<[number,number]>} idealKps    – array of normalized “ideal” keypoints
 * @param {Array<[number,number]>} userKps     – array of normalized user keypoints
 * @param {[number,number]} hipPoint           – [x,y] in normalized space
 * @returns {{ norm: [number,number], pix: [number,number] }}
 */
export function getScaledIdealKeypoint(ctx, idx, idealKps, userKps, hipPoint, scalingFactor) {
  const width  = ctx.canvas.width;
  const height = ctx.canvas.height;

  // 1) Get direction+distance from hip → user joint
  const userDir  = getDirectionVector(hipPoint, userKps[idx]);
  // 2) Get direction+distance from hip → ideal joint
  const idealDir = getDirectionVector(hipPoint, idealKps[idx]);

  // 3) Compute scale so idealDist → userDist
  const scale = scalingFactor;

  // 4) Scale the ideal vector
  const scaledRaw = [
    idealDir.raw[0] * scale,
    idealDir.raw[1] * scale
  ];

  // 5) Reconstruct corrected ideal in normalized space
  const correctedNorm = [
    hipPoint[0] + scaledRaw[0],
    hipPoint[1] + scaledRaw[1]
  ];

  // 6) Convert to pixel coords
  const correctedPix = [
    correctedNorm[0] * width,
    correctedNorm[1] * height
  ];

  return {
    norm: correctedNorm,
    pix:  correctedPix
  };
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
  return underThresholdCount > 9;
}


/**
 * Calculate the Euclidean distance between two 2D points.
 *
 * @param {number[]} p1  An array [x1, y1].
 * @param {number[]} p2  An array [x2, y2].
 * @returns {number}     The distance = √((x2–x1)² + (y2–y1)²).
 */
function calculateEuclideanDistance(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.hypot(dx, dy);
}

export function checkBendback(ctx, idealKeypoints, normalizedKeypoints, hipPoint, thresholds, scalingFactor, curr_phase = null) {
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

    const LeftWristTh    = thresholds[15] * calculateEuclideanDistance(idealKeypoints[15], idealKeypoints[23]);
    const RightWristTh   = thresholds[16] * calculateEuclideanDistance(idealKeypoints[16], idealKeypoints[23]);
    const LeftShoulderTh = thresholds[11] * calculateEuclideanDistance(idealKeypoints[11], idealKeypoints[23]);
    const RightShoulderTh= thresholds[12] * calculateEuclideanDistance(idealKeypoints[12], idealKeypoints[23]);
    const LeftElbowTh    = thresholds[13] * calculateEuclideanDistance(idealKeypoints[13], idealKeypoints[23]);
    const RightElbowTh   = thresholds[14] * calculateEuclideanDistance(idealKeypoints[14], idealKeypoints[23]);
    const LeftKneeTh     = thresholds[25] * calculateEuclideanDistance(idealKeypoints[25], idealKeypoints[23]);
    const RightKneeTh    = thresholds[26] * calculateEuclideanDistance(idealKeypoints[26], idealKeypoints[23]);
    const LeftAnkleTh    = thresholds[27] * calculateEuclideanDistance(idealKeypoints[27], idealKeypoints[23]);
    const RightAnkleTh   = thresholds[28] * calculateEuclideanDistance(idealKeypoints[28], idealKeypoints[23]);
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
      if(curr_phase == null){
        // 1) compute the correctly scaled ideal pixel:
        const { pix: idealPix } = getScaledIdealKeypoint(
          ctx,
          idx,
          idealKeypoints,
          normalizedKeypoints,
          hipPoint,
          scalingFactor
        );
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
        // const idealPix = [ idealNorm[0] * width, idealNorm[1] * height ];

        // now your existing drawing code:
        //
        // draw the circle:
        const DistPix = calculateEuclideanDistance(hipPix, idealPix);
        const radius  = thresholds[idx] * DistPix;
        ctx.beginPath();
        ctx.arc(idealPix[0], idealPix[1], radius, 0, Math.PI*2);
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth   = 2;
        ctx.stroke();

        // draw the arrow:
        ctx.beginPath();
        ctx.moveTo(userPix[0], userPix[1]);
        ctx.lineTo(idealPix[0], idealPix[1]);
        ctx.strokeStyle = "yellow";
        ctx.lineWidth   = 3;
        ctx.stroke();

        // draw the arrowhead:
        const angle     = Math.atan2(idealPix[1] - userPix[1], idealPix[0] - userPix[0]);
        const arrowSize = 10;
        ctx.beginPath();
        ctx.moveTo(idealPix[0], idealPix[1]);
        ctx.lineTo(
          idealPix[0] - arrowSize * Math.cos(angle + Math.PI/6),
          idealPix[1] - arrowSize * Math.sin(angle + Math.PI/6)
        );
        ctx.moveTo(idealPix[0], idealPix[1]);
        ctx.lineTo(
          idealPix[0] - arrowSize * Math.cos(angle - Math.PI/6),
          idealPix[1] - arrowSize * Math.sin(angle - Math.PI/6)
        );
        ctx.stroke();

      }
      
    });

    const success = checkPoseSuccess(idealKeypoints, normalizedKeypoints, thresholds_new);
    return [ctx, success];
}





