import { calculateDtwScore } from '../utils/utils.js';
import { drawDtwScores, printTextOnFrame } from '../utils/camera_utils.js';

export function checkPoseSuccess(idealKeypoints, normalizedKeypoints, thresholds) {
    if (!normalizedKeypoints) return false;
    const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints, normalizedKeypoints);
    const { dtwDistance: dtwHand } = calculateDtwScore(idealKeypoints.slice(13, 21), normalizedKeypoints.slice(15, 21));
    const { dtwDistance: dtwShoulder } = calculateDtwScore([idealKeypoints[11], idealKeypoints[12]], [normalizedKeypoints[11], normalizedKeypoints[12]]);
    return dtwWhole < thresholds[0] && dtwHand < thresholds[1] && dtwShoulder < thresholds[2];
}

export function checkBendback(ctx, idealKeypoints, normalizedKeypoints, currentTime, thresholds) {
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

    const idealWrist = idealKeypoints[15];
    const curWrist = normalizedKeypoints[15];
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const curPoint = [(curWrist[0] + 1) * width / 2, (curWrist[1] + 1) * height / 2];
    const idealPoint = [(idealWrist[0] + 1) * width / 2, (idealWrist[1] + 1) * height / 2];
    ctx.beginPath();
    ctx.moveTo(curPoint[0], curPoint[1]);
    ctx.lineTo(idealPoint[0], idealPoint[1]);
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 3;
    ctx.stroke();

    const success = checkPoseSuccess(idealKeypoints, normalizedKeypoints, thresholds);
    return [ctx, success];
}





