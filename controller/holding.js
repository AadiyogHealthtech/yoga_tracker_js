
import { drawDtwScores, printTextOnFrame } from '../utils/camera_utils.js';
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
    const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints, normalizedKeypoints);
    const { dtwDistance: dtwLeftWrist } = calculateDtwScore([idealKeypoints[15]], [normalizedKeypoints[15]]);
    const { dtwDistance: dtwLeftShoulder } = calculateDtwScore([idealKeypoints[11]], [normalizedKeypoints[11]]);
    return dtwWhole < thresholds[0] && dtwLeftWrist < thresholds[1] && dtwLeftShoulder < thresholds[2];
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

export function checkBendback(ctx, idealKeypoints, normalizedKeypoints, hipPoint, thresholds) {
    if (!normalizedKeypoints) {
        printTextOnFrame(ctx, 'Keypoints not detected', { x: 50, y: 50 }, 'red');
        return [ctx, false];
    }

    const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints, normalizedKeypoints);
    const { dtwDistance: dtwLeftWrist } = calculateDtwScore([idealKeypoints[15]], [normalizedKeypoints[15]]);
    const { dtwDistance: dtwLeftShoulder } = calculateDtwScore([idealKeypoints[11]], [normalizedKeypoints[11]]);
    const { dtwDistance: dtwTorso } = calculateDtwScore([idealKeypoints[15]], [normalizedKeypoints[15]]);

    const handTh  = thresholds[1] * calculateEuclideanDistance(idealKeypoints[15], idealKeypoints[23]);
    const shoulTh = thresholds[2] * calculateEuclideanDistance(idealKeypoints[11], idealKeypoints[23]);

    const scores = {
        'Whole Body': { value: dtwWhole, threshold: thresholds[0] },
        'Hand': { value: dtwLeftWrist, threshold: handTh },
        'Shoulder': { value: dtwLeftShoulder, threshold: shoulTh }
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
    
    const Dist = calculateEuclideanDistance(hipPix, idealNorm);
    const DistPix = calculateEuclideanDistance(hipPix, idealPix);
    console.log("Distance between hip and wrist is : ", Dist);
    const radius = thresholds[1] * DistPix;
    ctx.strokeStyle = "#FF0000"; // Red circle
    ctx.lineWidth = 2; // Line width of 2 pixels
    // Draw the circle
    ctx.beginPath();
    ctx.arc(idealPix[0], idealPix[1], radius, 0, Math.PI * 2);
    ctx.stroke();
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

    const success = checkPoseSuccess(idealKeypoints, normalizedKeypoints, [thresholds[0], handTh, shoulTh]);
    return [ctx, success];
}





