// utils/utils.js
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
    return normalized;
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

export function calculateDtwScore(series1, series2) {
    try {
        const custom3dDistance = (a, b) => {
            const aArr = Array.isArray(a) ? a : [a];
            const bArr = Array.isArray(b) ? b : [b];
            return Math.sqrt(
                aArr.reduce((sum, val, i) => {
                    const diff = val - (bArr[i] || 0);
                    return sum + diff * diff;
                }, 0)
            );
        };

        console.log(`Series1 length: ${series1.length}, Series2 length: ${series2.length}`);
        const [dtwDistance, path] = fastdtw(series1, series2, 2, custom3dDistance);
        console.log('DTW Distance:', dtwDistance);
        return { dtwDistance, path };
    } catch (error) {
        console.error("Error calculating DTW score:", error);
        return null;
    }
}

export function detectFacing(landmarks, xThreshold = 0.5, yThreshold = 0.5, zThreshold = 0.5) {
    const keypoints = normalizeKeypoints(landmarks);
    if (!keypoints) {
        console.warn('No keypoints available for facing detection');
        return 'random';
    }

    const leftShoulder = keypoints[11];
    const rightShoulder = keypoints[12];
    const rightHip = keypoints[24];

    console.log('DetectFacing - Input landmarks sample:', landmarks.slice(0, 5));
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
        if (!landmarks[i].visibility || landmarks[i].visibility < 0.5) {
            missing.push(i);
        }
    }
    console.log('Keypoint visibility - Missing:', missing);
    return [missing.length === 0, missing];
}