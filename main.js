// // main.js
import { Controller } from './controller/controller.js';
import { printTextOnFrame } from './utils/camera_utils.js';
console.log('Starting main.js');
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');

console.log('Initializing MediaPipe Pose');
const pose = new Pose({
    locateFile: (file) => {
        console.log(`Loading MediaPipe file: ${file}`);
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});
pose.setOptions({
    modelComplexity: 2,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
pose.onResults(onResults);

const exercisePlan = {
    "Anuvittasana": {
        "json_path": "assets/Tadasana_Ideal_video.json",
        "reps": 3
    }
};

console.log('Creating Controller instance');
const controller = new Controller(exercisePlan);
async function setupCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('MediaDevices API is not supported in this browser or context.');
        alert('Please run this app over HTTP/HTTPS (e.g., via a local server) and ensure your browser supports the MediaDevices API.');
        return;
    }

    try {
        console.log('Requesting camera access');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = async () => {
            console.log('Video metadata loaded, starting playback');
            videoElement.play();
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            console.log('Initializing controller');
            await controller.initialize();
            if (controller.segments.length > 0) {
                console.log('Starting exercise sequence');
                controller.startExerciseSequence();
                requestAnimationFrame(processFrame);
            } else {
                console.error('Failed to initialize segments, exercise cannot start');
                alert('Failed to load exercise data. Please check the JSON file path and contents.');
            }
        }; // <-- This closing brace was missing
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Could not access the camera. Please allow camera permissions and try again.');
    }
}


async function onResults(results) {
    console.log('Pose results received:', results);
    controller.updateFrame(results);
}

async function processFrame(timestamp) {
    //console.log('Processing frame at timestamp:', timestamp);
    await pose.send({ image: videoElement });

    const currentTime = timestamp / 1000; // Convert to seconds
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    controller.frame = canvasCtx;
    const [currentPhase, exerciseName, repCount, totalReps] = controller.processExercise(currentTime);

    if (repCount >= 0) {
        printTextOnFrame(canvasCtx, `Exercise: ${exerciseName} | Reps: ${repCount}/${totalReps}`, 
            { x: 10, y: 30 }, 'green');
    }

    canvasCtx.restore();
    requestAnimationFrame(processFrame);
}

console.log('Setting up camera');
setupCamera().catch(error => console.error('Setup camera failed:', error));

// main.js

// 2) Your exercise plan + controller
// const exercisePlan = {
//   Anuvittasana: {
//     json_path: 'assets/Trikonasana_ideal_video_keypoints.json',  // your normalized‑keypoints JSON
//     reps:      3
//   }
// };
// const controller = new Controller(exercisePlan);
// // 3) onResults now does **all** drawing + exercise logic
// pose.onResults(results => {
//   // 3a) Update your controller with the latest pose
//   controller.updateFrame(results);
//   console.log('lastValidPoseTime:', controller.lastValidPoseTime);
//   console.log('landmarks:',          controller.landmarks);
//   console.log('hipPoint:',           controller.hipPoint);
//   // 3b) Clear + redraw the video frame
//   canvasCtx.save();
//   canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
//   canvasCtx.drawImage(videoElement,
//                       0, 0,
//                       canvasElement.width,
//                       canvasElement.height);

//   // 3c) Run your exercise logic
//   //    (we use performance.now()/1000 as “currentTime” in seconds)
//   const currentTime = performance.now() / 1000;
//   const [phase, name, doneReps, totalReps] =
//     controller.processExercise(currentTime);

//   // 3d) Overlay your reps text
//   if (doneReps >= 0) {
//     printTextOnFrame(
//       canvasCtx,
//       `Exercise: ${name} | Reps: ${doneReps}/${totalReps}`,
//       { x: 10, y: 30 },
//       'green'
//     );
//   }

//   canvasCtx.restore();
// });

// // 4) A simple `onFrame()` loop to push each frame into MediaPipe
// async function onFrame() {
//   await pose.send({ image: videoElement });
//   requestAnimationFrame(onFrame);
// }

// // 5) Bootstrapping all together
// (async () => {
//   try {
//     // Wait for video metadata
//     await new Promise(resolve => {
//       videoElement.onloadedmetadata = resolve;
//       videoElement.load();
//     });

//     // Mute+autoplay to satisfy browser policies
//     videoElement.muted     = true;
//     videoElement.autoplay  = true;
//     videoElement.loop      = true;
//     videoElement.playsInline = true;
//     await videoElement.play();

//     // Match canvas to video size
//     canvasElement.width  = videoElement.videoWidth;
//     canvasElement.height = videoElement.videoHeight;

//     controller.frame = canvasCtx;


//     // Initialize your controller
//     await controller.initialize();
//     if (!controller.segments.length) {
//       throw new Error('No exercise segments loaded; check your JSON path!');
//     }
//     controller.startExerciseSequence();
    
//     console.log(`here we go: ${controller.landmarks}`);

//     // Start the MediaPipe→draw loop
//     requestAnimationFrame(onFrame);

//   } catch (err) {
//     console.error('Initialization failed:', err);
//     alert('Could not start Yoga Tracker. See console for details.');
//   }
// })();