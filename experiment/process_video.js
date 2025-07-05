
import { normalizeKeypoints } from '../utils/utils.js';

(async function() {
  // … your setup …

  // Now Pose is an ES-module class
  const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
  });

  pose.setOptions({
    modelComplexity: 2,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  await pose.initialize();


  const video = document.getElementById('videoElement');
  await new Promise(r => {
    video.onloadedmetadata = r;
    video.load();
  });
  const frameRate = 30;
  const totalFrames = Math.ceil(video.duration * frameRate);

  // Offscreen canvas for capturing frames
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;


  // Buffer to hold every frame's array of "x,y,z,visibility" strings
  const frames = [];

  // Promise-based wrapper for pose detection
  function sendFrameToPose(image) {
    return new Promise((resolve) => {
      pose.onResults(resolve);
      pose.send({ image });
    });
  }

  // Iterate all frames
  for (let f = 0; f < totalFrames; f++) {
    // Seek to frame time
    await new Promise(r => {
      video.onseeked = r;
      video.currentTime = f / frameRate;
    });

    // Draw to canvas & grab image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    let image;
    if (canvas.transferToImageBitmap) {
      image = canvas.transferToImageBitmap();
    } else {
      image = await createImageBitmap(canvas);
    }

    // Run Pose
    const results = await sendFrameToPose(image);

    // Build the array of strings for this frame
    if (results.poseLandmarks) {
      const [norm,hip] = normalizeKeypoints(results.poseLandmarks);
      const row = norm.map((kp, i) => {
        return [
          kp[0].toFixed(8),
          kp[1].toFixed(8),
          kp[2].toFixed(8),
          results.poseLandmarks[i].visibility.toFixed(8)
        ].join(',');
      });
      frames.push(row);
    } else {
      // No detection → push 33 zero-rows
      frames.push(Array(33).fill("0.00000000,0.00000000,0.00000000,0.00000000"));
    }

    // Progress logging
    if (f % 50 === 0) console.log(`Processed frame ${f}/${totalFrames}`);
  }

  // Once done, assemble and download JSON
  const output = { frames };
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${video.currentSrc.split('/').pop().split('.')[0]}_keypoints.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  console.log('All done! JSON download triggered.');
})();