import { calculateDtwScore, calculateEuclideanDistance } from '../utils/utils.js';
import { drawDtwScores, printTextOnFrame } from '../utils/camera_utils.js';

export function checkPoseSuccess(idealKeypoints, normalizedKeypoints, thresholds) {
    if (!normalizedKeypoints) return false;
    const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints, normalizedKeypoints);
    const { dtwDistance: dtwHand } = calculateDtwScore(idealKeypoints.slice(13, 21), normalizedKeypoints.slice(15, 21));
    const { dtwDistance: dtwShoulder } = calculateDtwScore([idealKeypoints[11], idealKeypoints[12]], [normalizedKeypoints[11], normalizedKeypoints[12]]);
    return dtwWhole < thresholds[0] && dtwHand < thresholds[1] && dtwShoulder < thresholds[2];
}

/**
 * Calculate the Euclidean distance between two 2D points.
 *
 * @param {number[]} p1  An array [x1, y1].
 * @param {number[]} p2  An array [x2, y2].
 * @returns {number}     The distance = √((x2–x1)² + (y2–y1)²).
 */
function calculateDistance(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.hypot(dx, dy);
}
export function checkBendback(ctx, idealKeypoints, normalizedKeypoints, hipPoint, thresholds) {
    if (!normalizedKeypoints) {
        printTextOnFrame(ctx, 'Keypoints not detected', { x: 50, y: 50 }, 'red');
        return [ctx, false];
    }

    const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints, normalizedKeypoints);
    const { dtwDistance: dtwHand } = calculateDtwScore(idealKeypoints.slice(13, 21), normalizedKeypoints.slice(15, 21));
    const { dtwDistance: dtwShoulder } = calculateDtwScore([idealKeypoints[11], idealKeypoints[12]], [normalizedKeypoints[11], normalizedKeypoints[12]]);
    const { dtwDistance: dtwTorso } = calculateDtwScore([idealKeypoints[15]], [normalizedKeypoints[15]]);

    const scores = {
        'Whole Body': { value: dtwWhole, threshold: thresholds[0] },
        'Hand': { value: dtwHand, threshold: thresholds[1] },
        'Shoulder': { value: dtwShoulder, threshold: thresholds[2] }
    };
    drawDtwScores(ctx, scores);

    // Reconstruct absolute normalized coords for wrist
    const userRel  = normalizedKeypoints[15]; // [dx, dy]
    const idealRel = idealKeypoints[15];      // [dx, dy]
    const hipNorm  = hipPoint;                // [hx, hy]

    const userNorm  = [ userRel[0]  + hipNorm[0],  userRel[1]  + hipNorm[1] ];
    const idealNorm = [ idealRel[0] + hipNorm[0],  idealRel[1] + hipNorm[1] ];

    // Convert to pixel space
    const width   = ctx.canvas.width;
    const height  = ctx.canvas.height;
    const userPix = [ userNorm[0] * width,  userNorm[1] * height ];
    const idealPix= [ idealNorm[0]* width,  idealNorm[1]* height ];
    const hipPix = [hipNorm[0]*width, hipNorm[1]*height];
    
    // const Dist = calculateDistance(hipPix, idealNorm);
    // const DistPix = calculateDistance(hipPix, idealPix);
    // console.log("Distance between hip and wrist is : ", Dist);
    // const radius = 0.193798 * DistPix;
    // ctx.strokeStyle = "#FF0000"; // Red circle
    // ctx.lineWidth = 2; // Line width of 2 pixels
    // // Draw the circle
    // ctx.beginPath();
    // ctx.arc(idealPix[0], idealPix[1], radius, 0, Math.PI * 2);
    // ctx.stroke();
    // Draw guidance arrow in yellow
    ctx.beginPath();
    ctx.moveTo(userPix[0], userPix[1]);
    ctx.lineTo(idealPix[0], idealPix[1]);
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Arrowhead
    const angle     = Math.atan2(
        idealPix[1] - userPix[1],
        idealPix[0] - userPix[0]
    );
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

    const success = checkPoseSuccess(idealKeypoints, normalizedKeypoints, thresholds);
    return [ctx, success];
}





